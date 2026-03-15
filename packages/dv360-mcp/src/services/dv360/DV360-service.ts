// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import { McpError, JsonRpcErrorCode } from "../../utils/errors/index.js";
import { RateLimiter } from "../../utils/security/rate-limiter.js";
import {
  getEntityConfigDynamic,
  getEntitySchemaForOperation,
} from "../domain/entity-mapping.js";
import { withDV360ApiSpan, setSpanAttribute } from "../../utils/telemetry/index.js";
import type { RequestContext } from "@cesteral/shared";
import { DV360HttpClient } from "./dv360-http-client.js";

// ============================================================================
// Deep Merge Utility
// ============================================================================

/**
 * Check whether a value is a plain object (not an array, Date, RegExp, etc.)
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Recursively deep-merge `source` into `target`.
 *
 * Rules:
 * - Plain objects are merged recursively.
 * - Arrays in `source` **replace** the corresponding array in `target`.
 * - `null` values in `source` **override** (do not skip).
 * - All other values in `source` override `target`.
 */
function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Record<string, unknown>
): T {
  const result: Record<string, unknown> = { ...target };

  for (const key of Object.keys(source)) {
    const sourceVal = source[key];
    const targetVal = result[key];

    if (sourceVal === null) {
      // Null in source explicitly overrides
      result[key] = null;
    } else if (isPlainObject(sourceVal) && isPlainObject(targetVal)) {
      // Both are plain objects — recurse
      result[key] = deepMerge(targetVal as Record<string, unknown>, sourceVal);
    } else {
      // Everything else (arrays, primitives, Date, etc.) — replace
      result[key] = sourceVal;
    }
  }

  return result as T;
}

// ============================================================================
// Custom Bidding Types
// ============================================================================

/**
 * Script error returned when a script is rejected
 */
export interface ScriptError {
  errorCode: "SYNTAX_ERROR" | "DEPRECATED_SYNTAX" | "INTERNAL_ERROR";
  line: string;
  column: string;
  errorMessage: string;
}

/**
 * Custom bidding script resource
 */
export interface CustomBiddingScript {
  name: string;
  customBiddingAlgorithmId: string;
  customBiddingScriptId: string;
  createTime: string;
  active: boolean;
  state: "PENDING" | "ACCEPTED" | "REJECTED";
  errors?: ScriptError[];
  script?: {
    resourceName: string;
  };
}

/**
 * Rules error returned when rules are rejected
 */
export interface RulesError {
  errorCode: "SYNTAX_ERROR" | "CONSTRAINT_VIOLATION" | "INTERNAL_ERROR";
  errorMessage: string;
}

/**
 * Custom bidding algorithm rules resource
 */
export interface CustomBiddingAlgorithmRules {
  name: string;
  customBiddingAlgorithmId: string;
  customBiddingAlgorithmRulesId: string;
  createTime: string;
  active: boolean;
  state: "ACCEPTED" | "REJECTED";
  error?: RulesError;
  rules?: {
    resourceName: string;
  };
}

/**
 * Service for interacting with DV360 API
 * Provides generic entity operations (list, get, create, update, delete)
 */
export class DV360Service {
  constructor(
    private logger: Logger,
    private rateLimiter: RateLimiter,
    private httpClient: DV360HttpClient
  ) {}

  /**
   * List entities with optional filtering and pagination
   */
  async listEntities(
    entityType: string,
    ids: Record<string, string>,
    filter?: string,
    pageToken?: string,
    pageSize?: number,
    context?: RequestContext
  ): Promise<{ entities: unknown[]; nextPageToken?: string }> {
    return withDV360ApiSpan("listEntities", entityType, async () => {
      const config = getEntityConfigDynamic(entityType);

      // Validate that all required parent IDs are present
      for (const requiredParentId of config.parentIds) {
        if (!ids[requiredParentId]) {
          throw new McpError(
            JsonRpcErrorCode.InvalidParams,
            `Missing required parent ID '${requiredParentId}' for listing ${entityType} entities`,
            {
              entityType,
              requiredParentIds: config.parentIds,
              providedIds: Object.keys(ids),
              requestId: context?.requestId,
            }
          );
        }
      }

      // Construct API path
      const basePath = typeof config.apiPath === "function" ? config.apiPath(ids) : config.apiPath;

      // Build query params
      const params = new URLSearchParams();

      // Add parent IDs that should be query parameters (e.g., partnerId for advertisers)
      for (const queryParamId of config.queryParamIds) {
        if (ids[queryParamId]) {
          params.append(queryParamId, ids[queryParamId]);
          setSpanAttribute(`dv360.${queryParamId}`, ids[queryParamId]);
        }
      }

      if (filter && config.supportsFilter) {
        params.append("filter", filter);
        setSpanAttribute("dv360.filter", filter);
      } else if (filter && !config.supportsFilter) {
        this.logger.warn(
          { entityType, filter, requestId: context?.requestId },
          "Filter parameter provided but entity type does not support filtering — filter will be ignored"
        );
      }
      if (pageToken) {
        params.append("pageToken", pageToken);
        setSpanAttribute("dv360.pageToken", "present");
      }
      if (pageSize) {
        params.append("pageSize", pageSize.toString());
        setSpanAttribute("dv360.pageSize", pageSize);
      }

      const path = `${basePath}${params.toString() ? `?${params.toString()}` : ""}`;
      setSpanAttribute("dv360.apiPath", basePath);

      // Rate limit by advertiser
      if (ids.advertiserId) {
        await this.rateLimiter.consume(`dv360:${ids.advertiserId}`, 1);
        setSpanAttribute("dv360.advertiserId", ids.advertiserId);
      }

      const response = await this.httpClient.fetch(path, context);

      // Validate response with generated schema
      const schema = getEntitySchemaForOperation(entityType, "list");
      const validated = schema.parse(response);

      const entities = (validated as any)[`${entityType}s`] || [];
      setSpanAttribute("dv360.resultCount", entities.length);

      return {
        entities,
        nextPageToken: (validated as any).nextPageToken,
      };
    });
  }

  /**
   * Get single entity by ID
   */
  async getEntity(
    entityType: string,
    ids: Record<string, string>,
    context?: RequestContext
  ): Promise<unknown> {
    return withDV360ApiSpan("getEntity", entityType, async () => {
      const config = getEntityConfigDynamic(entityType);

      // Construct full path including entity ID
      const basePath = typeof config.apiPath === "function" ? config.apiPath(ids) : config.apiPath;
      const entityId = ids[`${entityType}Id`];

      if (!entityId) {
        throw new McpError(
          JsonRpcErrorCode.InvalidParams,
          `Entity ID is required for ${entityType}`,
          { entityType, providedIds: Object.keys(ids) }
        );
      }

      const path = `${basePath}/${entityId}`;

      // Rate limit by advertiser
      if (ids.advertiserId) {
        await this.rateLimiter.consume(`dv360:${ids.advertiserId}`, 1);
        setSpanAttribute("dv360.advertiserId", ids.advertiserId);
      }

      setSpanAttribute("dv360.entityId", entityId);

      const response = await this.httpClient.fetch(path, context);

      // Validate with generated schema
      const schema = getEntitySchemaForOperation(entityType, "get");
      return schema.parse(response);
    });
  }

  /**
   * Create new entity
   */
  async createEntity(
    entityType: string,
    ids: Record<string, string>,
    data: Record<string, unknown>,
    context?: RequestContext
  ): Promise<unknown> {
    return withDV360ApiSpan("createEntity", entityType, async () => {
      const config = getEntityConfigDynamic(entityType);

      if (!config.supportsCreate) {
        throw new McpError(
          JsonRpcErrorCode.InvalidParams,
          `Entity type ${entityType} does not support create operation`,
          { entityType }
        );
      }

      // Validate input data with generated schema
      const schema = getEntitySchemaForOperation(entityType, "create");
      const validated = schema.parse(data);

      const basePath = typeof config.apiPath === "function" ? config.apiPath(ids) : config.apiPath;
      setSpanAttribute("dv360.apiPath", basePath);

      // Rate limit by advertiser
      if (ids.advertiserId) {
        await this.rateLimiter.consume(`dv360:${ids.advertiserId}`, 1);
        setSpanAttribute("dv360.advertiserId", ids.advertiserId);
      }

      const response = await this.httpClient.fetch(basePath, context, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
      });

      return schema.parse(response);
    });
  }

  /**
   * Update entity with updateMask.
   *
   * @param currentEntity - Optional pre-fetched entity data. When provided,
   *   the service skips the redundant GET and deep-merges updates into this
   *   object directly. Callers that already have the current entity (e.g. tool
   *   handlers that fetch it for previousValues) should pass it here to avoid
   *   a triple API call (GET in tool + GET in service + PATCH).
   */
  async updateEntity(
    entityType: string,
    ids: Record<string, string>,
    data: Record<string, unknown>,
    updateMask: string,
    context?: RequestContext,
    currentEntity?: Record<string, unknown>
  ): Promise<unknown> {
    return withDV360ApiSpan("updateEntity", entityType, async () => {
      const config = getEntityConfigDynamic(entityType);

      if (!config.supportsUpdate) {
        throw new McpError(
          JsonRpcErrorCode.InvalidParams,
          `Entity type ${entityType} does not support update operation`,
          { entityType }
        );
      }

      setSpanAttribute("dv360.updateMask", updateMask);
      setSpanAttribute("dv360.updateFieldsCount", updateMask.split(",").length);

      // Use pre-fetched entity if provided, otherwise fetch current state
      const current = currentEntity ?? (await this.getEntity(entityType, ids, context)) as Record<string, unknown>;
      const merged = deepMerge(current, data);

      // Validate merged entity
      const schema = getEntitySchemaForOperation(entityType, "update");
      const validated = schema.parse(merged);

      const basePath = typeof config.apiPath === "function" ? config.apiPath(ids) : config.apiPath;
      const entityId = ids[`${entityType}Id`];

      if (!entityId) {
        throw new McpError(
          JsonRpcErrorCode.InvalidParams,
          `Entity ID is required for ${entityType}`,
          { entityType, providedIds: Object.keys(ids) }
        );
      }

      setSpanAttribute("dv360.entityId", entityId);
      const path = `${basePath}/${entityId}?updateMask=${encodeURIComponent(updateMask)}`;

      // Rate limit by advertiser
      if (ids.advertiserId) {
        await this.rateLimiter.consume(`dv360:${ids.advertiserId}`, 1);
        setSpanAttribute("dv360.advertiserId", ids.advertiserId);
      }

      const response = await this.httpClient.fetch(path, context, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
      });

      return schema.parse(response);
    });
  }

  /**
   * Bulk create entities in parallel with concurrency=5.
   * Mirrors the TTD executeBulk pattern — runs items in batches of 5 via
   * Promise.allSettled so failed items never block remaining creates.
   *
   * @param entityType - DV360 entity type (e.g. "lineItem", "campaign")
   * @param items - Array of pre-processed items ready to pass to createEntity
   * @param context - Request context
   * @returns Per-item results preserving original array indices
   */
  async bulkCreateEntities(
    entityType: string,
    items: Array<{
      entityIds: Record<string, string>;
      mergedData: Record<string, unknown>;
    }>,
    context?: RequestContext
  ): Promise<Array<{ success: boolean; entity?: unknown; error?: string }>> {
    const CONCURRENCY = 5;
    const results: Array<{ success: boolean; entity?: unknown; error?: string }> =
      new Array(items.length);

    for (let i = 0; i < items.length; i += CONCURRENCY) {
      const batch = items.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.allSettled(
        batch.map((item) =>
          this.createEntity(entityType, item.entityIds, item.mergedData, context)
        )
      );

      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        if (result.status === "fulfilled") {
          results[i + j] = { success: true, entity: result.value };
        } else {
          results[i + j] = {
            success: false,
            error: result.reason?.message ?? String(result.reason),
          };
        }
      }
    }

    return results;
  }

  /**
   * Delete entity
   */
  async deleteEntity(
    entityType: string,
    ids: Record<string, string>,
    context?: RequestContext
  ): Promise<void> {
    return withDV360ApiSpan("deleteEntity", entityType, async () => {
      const config = getEntityConfigDynamic(entityType);

      if (!config.supportsDelete) {
        throw new McpError(
          JsonRpcErrorCode.InvalidParams,
          `Entity type ${entityType} does not support delete operation`,
          { entityType }
        );
      }

      const basePath = typeof config.apiPath === "function" ? config.apiPath(ids) : config.apiPath;
      const entityId = ids[`${entityType}Id`];

      if (!entityId) {
        throw new McpError(
          JsonRpcErrorCode.InvalidParams,
          `Entity ID is required for ${entityType}`,
          { entityType, providedIds: Object.keys(ids) }
        );
      }

      const path = `${basePath}/${entityId}`;
      setSpanAttribute("dv360.entityId", entityId);

      // Rate limit by advertiser
      if (ids.advertiserId) {
        await this.rateLimiter.consume(`dv360:${ids.advertiserId}`, 1);
        setSpanAttribute("dv360.advertiserId", ids.advertiserId);
      }

      await this.httpClient.fetch(path, context, { method: "DELETE" });
    });
  }

  // ============================================================================
  // Custom Bidding Algorithm Operations
  // ============================================================================

  /**
   * Upload a custom bidding script file and get a reference for creating script resource
   * @param customBiddingAlgorithmId - The algorithm ID to upload script for
   * @param scriptContent - The script content as a string
   * @param context - Request context
   * @returns Reference object containing resourceName for script creation
   */
  async uploadCustomBiddingScript(
    customBiddingAlgorithmId: string,
    scriptContent: string,
    context?: RequestContext
  ): Promise<{ resourceName: string }> {
    return withDV360ApiSpan("uploadCustomBiddingScript", customBiddingAlgorithmId, async () => {
      setSpanAttribute("dv360.customBiddingAlgorithmId", customBiddingAlgorithmId);
      setSpanAttribute("dv360.scriptLength", scriptContent.length);

      // Upload endpoint is different from main API — derive from configured base URL
      const uploadUrl = `${this.httpClient.getUploadBaseUrl()}/customBiddingAlgorithms/${customBiddingAlgorithmId}:uploadScript`;

      this.logger.debug(
        { uploadUrl, algorithmId: customBiddingAlgorithmId, requestId: context?.requestId },
        "Uploading custom bidding script"
      );

      const response = await this.httpClient.fetchRaw(uploadUrl, 30000, context, {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
        },
        body: scriptContent,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        throw new McpError(
          response.status >= 500
            ? JsonRpcErrorCode.ServiceUnavailable
            : JsonRpcErrorCode.InvalidRequest,
          `Failed to upload custom bidding script: ${response.status} ${response.statusText}`,
          {
            requestId: context?.requestId,
            httpStatus: response.status,
            customBiddingAlgorithmId,
            errorBody: errorBody.substring(0, 500),
          }
        );
      }

      const result = (await response.json()) as { resourceName: string };
      setSpanAttribute("dv360.scriptResourceName", result.resourceName);

      return result;
    });
  }

  /**
   * Create a custom bidding script resource (after uploading the script file)
   * @param customBiddingAlgorithmId - The algorithm ID
   * @param scriptResourceName - Resource name from uploadCustomBiddingScript
   * @param context - Request context
   * @returns Created script resource with state and details
   */
  async createCustomBiddingScript(
    customBiddingAlgorithmId: string,
    scriptResourceName: string,
    context?: RequestContext
  ): Promise<CustomBiddingScript> {
    return withDV360ApiSpan("createCustomBiddingScript", customBiddingAlgorithmId, async () => {
      setSpanAttribute("dv360.customBiddingAlgorithmId", customBiddingAlgorithmId);

      const path = `/customBiddingAlgorithms/${customBiddingAlgorithmId}/scripts`;

      const response = await this.httpClient.fetch(path, context, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          script: { resourceName: scriptResourceName },
        }),
      });

      return response as CustomBiddingScript;
    });
  }

  /**
   * List all scripts for a custom bidding algorithm
   * @param customBiddingAlgorithmId - The algorithm ID
   * @param pageToken - Optional pagination token
   * @param pageSize - Optional page size
   * @param context - Request context
   * @returns List of scripts with pagination
   */
  async listCustomBiddingScripts(
    customBiddingAlgorithmId: string,
    pageToken?: string,
    pageSize?: number,
    context?: RequestContext
  ): Promise<{ scripts: CustomBiddingScript[]; nextPageToken?: string }> {
    return withDV360ApiSpan("listCustomBiddingScripts", customBiddingAlgorithmId, async () => {
      setSpanAttribute("dv360.customBiddingAlgorithmId", customBiddingAlgorithmId);

      const params = new URLSearchParams();
      if (pageToken) params.append("pageToken", pageToken);
      if (pageSize) params.append("pageSize", pageSize.toString());

      const path = `/customBiddingAlgorithms/${customBiddingAlgorithmId}/scripts${params.toString() ? `?${params}` : ""}`;

      const response = (await this.httpClient.fetch(path, context)) as {
        customBiddingScripts?: CustomBiddingScript[];
        nextPageToken?: string;
      };

      setSpanAttribute("dv360.resultCount", response.customBiddingScripts?.length ?? 0);

      return {
        scripts: response.customBiddingScripts || [],
        nextPageToken: response.nextPageToken,
      };
    });
  }

  /**
   * Get a specific custom bidding script
   * @param customBiddingAlgorithmId - The algorithm ID
   * @param customBiddingScriptId - The script ID
   * @param context - Request context
   * @returns Script resource with state and details
   */
  async getCustomBiddingScript(
    customBiddingAlgorithmId: string,
    customBiddingScriptId: string,
    context?: RequestContext
  ): Promise<CustomBiddingScript> {
    return withDV360ApiSpan("getCustomBiddingScript", customBiddingAlgorithmId, async () => {
      setSpanAttribute("dv360.customBiddingAlgorithmId", customBiddingAlgorithmId);
      setSpanAttribute("dv360.customBiddingScriptId", customBiddingScriptId);

      const path = `/customBiddingAlgorithms/${customBiddingAlgorithmId}/scripts/${customBiddingScriptId}`;

      return (await this.httpClient.fetch(path, context)) as CustomBiddingScript;
    });
  }

  /**
   * Upload custom bidding rules file and get a reference for creating rules resource
   * @param customBiddingAlgorithmId - The algorithm ID to upload rules for
   * @param rulesContent - The rules content as a string (AlgorithmRules format)
   * @param context - Request context
   * @returns Reference object containing resourceName for rules creation
   */
  async uploadCustomBiddingRules(
    customBiddingAlgorithmId: string,
    rulesContent: string,
    context?: RequestContext
  ): Promise<{ resourceName: string }> {
    return withDV360ApiSpan("uploadCustomBiddingRules", customBiddingAlgorithmId, async () => {
      setSpanAttribute("dv360.customBiddingAlgorithmId", customBiddingAlgorithmId);
      setSpanAttribute("dv360.rulesLength", rulesContent.length);

      const uploadUrl = `${this.httpClient.getUploadBaseUrl()}/customBiddingAlgorithms/${customBiddingAlgorithmId}:uploadRules`;

      this.logger.debug(
        { uploadUrl, algorithmId: customBiddingAlgorithmId, requestId: context?.requestId },
        "Uploading custom bidding rules"
      );

      const response = await this.httpClient.fetchRaw(uploadUrl, 30000, context, {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
        },
        body: rulesContent,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        throw new McpError(
          response.status >= 500
            ? JsonRpcErrorCode.ServiceUnavailable
            : JsonRpcErrorCode.InvalidRequest,
          `Failed to upload custom bidding rules: ${response.status} ${response.statusText}`,
          {
            requestId: context?.requestId,
            httpStatus: response.status,
            customBiddingAlgorithmId,
            errorBody: errorBody.substring(0, 500),
          }
        );
      }

      const result = (await response.json()) as { resourceName: string };
      setSpanAttribute("dv360.rulesResourceName", result.resourceName);

      return result;
    });
  }

  /**
   * Create a custom bidding rules resource (after uploading the rules file)
   * @param customBiddingAlgorithmId - The algorithm ID
   * @param rulesResourceName - Resource name from uploadCustomBiddingRules
   * @param context - Request context
   * @returns Created rules resource with state and details
   */
  async createCustomBiddingRules(
    customBiddingAlgorithmId: string,
    rulesResourceName: string,
    context?: RequestContext
  ): Promise<CustomBiddingAlgorithmRules> {
    return withDV360ApiSpan("createCustomBiddingRules", customBiddingAlgorithmId, async () => {
      setSpanAttribute("dv360.customBiddingAlgorithmId", customBiddingAlgorithmId);

      const path = `/customBiddingAlgorithms/${customBiddingAlgorithmId}/rules`;

      const response = await this.httpClient.fetch(path, context, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rules: { resourceName: rulesResourceName },
        }),
      });

      return response as CustomBiddingAlgorithmRules;
    });
  }

  /**
   * List all rules for a custom bidding algorithm
   * @param customBiddingAlgorithmId - The algorithm ID
   * @param pageToken - Optional pagination token
   * @param pageSize - Optional page size
   * @param context - Request context
   * @returns List of rules with pagination
   */
  async listCustomBiddingRules(
    customBiddingAlgorithmId: string,
    pageToken?: string,
    pageSize?: number,
    context?: RequestContext
  ): Promise<{ rules: CustomBiddingAlgorithmRules[]; nextPageToken?: string }> {
    return withDV360ApiSpan("listCustomBiddingRules", customBiddingAlgorithmId, async () => {
      setSpanAttribute("dv360.customBiddingAlgorithmId", customBiddingAlgorithmId);

      const params = new URLSearchParams();
      if (pageToken) params.append("pageToken", pageToken);
      if (pageSize) params.append("pageSize", pageSize.toString());

      const path = `/customBiddingAlgorithms/${customBiddingAlgorithmId}/rules${params.toString() ? `?${params}` : ""}`;

      const response = (await this.httpClient.fetch(path, context)) as {
        customBiddingAlgorithmRules?: CustomBiddingAlgorithmRules[];
        nextPageToken?: string;
      };

      setSpanAttribute("dv360.resultCount", response.customBiddingAlgorithmRules?.length ?? 0);

      return {
        rules: response.customBiddingAlgorithmRules || [],
        nextPageToken: response.nextPageToken,
      };
    });
  }

  /**
   * Upload an asset (image or video) to DV360 via the multipart upload endpoint.
   *
   * Uses the upload base URL: POST /upload/displayvideo/v4/advertisers/{advertiserId}/assets
   *
   * @param advertiserId - The advertiser to upload the asset for
   * @param fileBuffer - The raw file bytes
   * @param filename - Original filename (used in Content-Disposition)
   * @param contentType - MIME type of the file (e.g., image/png, video/mp4)
   * @param context - Request context
   * @returns The created asset resource with assetId
   */
  async uploadAsset(
    advertiserId: string,
    fileBuffer: Buffer,
    filename: string,
    contentType: string,
    context?: RequestContext
  ): Promise<{ asset: { mediaId: string; content?: string }; assignedTargetingOptions?: unknown[] }> {
    return withDV360ApiSpan("uploadAsset", advertiserId, async () => {
      setSpanAttribute("dv360.advertiserId", advertiserId);
      setSpanAttribute("dv360.filename", filename);
      setSpanAttribute("dv360.contentType", contentType);
      setSpanAttribute("dv360.fileSize", fileBuffer.length);

      await this.rateLimiter.consume(`dv360:${advertiserId}`, 1);

      const uploadUrl = `${this.httpClient.getUploadBaseUrl()}/advertisers/${advertiserId}/assets`;

      // DV360 asset upload uses multipart/related:
      // Part 1: JSON metadata
      // Part 2: Binary file data
      const boundary = `boundary_${Date.now()}_${Math.random().toString(36).substring(2)}`;

      const jsonPart = JSON.stringify({ filename });
      const bodyParts = [
        `--${boundary}\r\n`,
        `Content-Type: application/json; charset=UTF-8\r\n\r\n`,
        `${jsonPart}\r\n`,
        `--${boundary}\r\n`,
        `Content-Type: ${contentType}\r\n`,
        `Content-Transfer-Encoding: binary\r\n\r\n`,
      ];

      // Build the multipart body with binary data
      const headerBuffer = Buffer.from(bodyParts.join(""));
      const footerBuffer = Buffer.from(`\r\n--${boundary}--\r\n`);
      const body = Buffer.concat([headerBuffer, fileBuffer, footerBuffer]);

      this.logger.debug(
        { uploadUrl, advertiserId, filename, contentType, requestId: context?.requestId },
        "Uploading asset to DV360"
      );

      const response = await this.httpClient.fetchRaw(uploadUrl, 120_000, context, {
        method: "POST",
        headers: {
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        throw new McpError(
          response.status >= 500
            ? JsonRpcErrorCode.ServiceUnavailable
            : JsonRpcErrorCode.InvalidRequest,
          `Failed to upload asset to DV360: ${response.status} ${response.statusText}`,
          {
            requestId: context?.requestId,
            httpStatus: response.status,
            advertiserId,
            filename,
            errorBody: errorBody.substring(0, 500),
          }
        );
      }

      return (await response.json()) as {
        asset: { mediaId: string; content?: string };
        assignedTargetingOptions?: unknown[];
      };
    });
  }

  /**
   * Duplicate a DV360 entity by fetching it and creating a copy.
   *
   * DV360 does not have a native :duplicate endpoint for most entity types.
   * This implements copy-on-read: GET entity -> strip read-only fields -> POST create.
   *
   * @param entityType - Entity type to duplicate (insertionOrder, lineItem)
   * @param ids - Entity IDs including advertiserId and the entity ID
   * @param displayName - Optional override display name for the copy
   * @param context - Request context
   * @returns The newly created entity
   */
  async duplicateEntity(
    entityType: string,
    ids: Record<string, string>,
    displayName?: string,
    context?: RequestContext
  ): Promise<unknown> {
    return withDV360ApiSpan("duplicateEntity", entityType, async () => {
      setSpanAttribute("dv360.entityType", entityType);

      // Fetch the source entity
      const source = (await this.getEntity(entityType, ids, context)) as Record<string, unknown>;

      // Strip read-only / server-generated fields
      const readOnlyFields = [
        "name",                     // resource name (e.g., advertisers/123/lineItems/456)
        `${entityType}Id`,          // server-assigned ID
        "updateTime",
        "createTime",
        "entityStatus",             // will default to DRAFT on creation
      ];

      const copyData: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(source)) {
        if (!readOnlyFields.includes(key)) {
          copyData[key] = value;
        }
      }

      // Override display name if provided
      if (displayName) {
        copyData.displayName = displayName;
      } else if (copyData.displayName) {
        copyData.displayName = `Copy of ${copyData.displayName as string}`;
      }

      // Create the copy using the parent IDs
      const parentIds: Record<string, string> = {};
      for (const [key, val] of Object.entries(ids)) {
        if (key !== `${entityType}Id`) {
          parentIds[key] = val;
        }
      }

      return this.createEntity(entityType, parentIds, copyData, context);
    });
  }

  /**
   * Get a delivery/targeting forecast for a line item via DV360 API.
   *
   * Uses the lineItems:generateDefault endpoint to get forecast data
   * for the given advertiser, or reads an existing line item's targeting
   * to provide reach estimation context.
   *
   * @param advertiserId - The advertiser ID
   * @param lineItemId - Optional: existing line item to read forecast for
   * @param context - Request context
   * @returns Forecast data from DV360
   */
  async getDeliveryEstimate(
    advertiserId: string,
    lineItemId?: string,
    context?: RequestContext
  ): Promise<Record<string, unknown>> {
    return withDV360ApiSpan("getDeliveryEstimate", advertiserId, async () => {
      setSpanAttribute("dv360.advertiserId", advertiserId);

      await this.rateLimiter.consume(`dv360:${advertiserId}`, 1);

      if (lineItemId) {
        setSpanAttribute("dv360.lineItemId", lineItemId);

        // Fetch line item details including budget and targeting info
        const lineItem = (await this.httpClient.fetch(
          `/advertisers/${advertiserId}/lineItems/${lineItemId}`,
          context
        )) as Record<string, unknown>;

        // Fetch targeting assigned to this line item
        const targeting = (await this.httpClient.fetch(
          `/advertisers/${advertiserId}/lineItems/${lineItemId}:bulkListAssignedTargetingOptions`,
          context
        )) as Record<string, unknown>;

        return {
          lineItem,
          assignedTargetingOptions: targeting,
          source: "lineItem",
        };
      }

      // Use generateDefault to get a default line item structure
      // which includes DV360's recommended settings and targeting defaults
      const result = (await this.httpClient.fetch(
        `/advertisers/${advertiserId}/lineItems:generateDefault`,
        context,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ advertiserId }),
        }
      )) as Record<string, unknown>;

      return {
        defaultLineItem: result,
        source: "generateDefault",
      };
    });
  }

  /**
   * List custom bidding algorithms with partnerId/advertiserId as proper query params.
   *
   * The DV360 API requires partnerId and advertiserId as top-level query parameters,
   * not as filter expressions. Only one of the two may be specified per request.
   *
   * @param partnerId - Partner ID (mutually exclusive with advertiserId)
   * @param advertiserId - Advertiser ID (mutually exclusive with partnerId)
   * @param filter - Optional filter expression (valid fields: customBiddingAlgorithmType, displayName, entityStatus, advertiserId, sharedWith)
   * @param pageToken - Optional pagination token
   * @param pageSize - Optional page size
   * @param context - Request context
   */
  async listCustomBiddingAlgorithmsEntities(
    partnerId?: string,
    advertiserId?: string,
    filter?: string,
    pageToken?: string,
    pageSize?: number,
    context?: RequestContext
  ): Promise<{ entities: unknown[]; nextPageToken?: string }> {
    return withDV360ApiSpan("listCustomBiddingAlgorithmsEntities", "customBiddingAlgorithm", async () => {
      const params = new URLSearchParams();
      if (partnerId) {
        params.append("partnerId", partnerId);
        setSpanAttribute("dv360.partnerId", partnerId);
      }
      if (advertiserId) {
        params.append("advertiserId", advertiserId);
        setSpanAttribute("dv360.advertiserId", advertiserId);
      }
      if (filter) params.append("filter", filter);
      if (pageToken) params.append("pageToken", pageToken);
      if (pageSize) params.append("pageSize", pageSize.toString());

      const path = `/customBiddingAlgorithms${params.toString() ? `?${params}` : ""}`;
      setSpanAttribute("dv360.apiPath", "/customBiddingAlgorithms");

      if (advertiserId) {
        await this.rateLimiter.consume(`dv360:${advertiserId}`, 1);
      }

      const response = (await this.httpClient.fetch(path, context)) as {
        customBiddingAlgorithms?: unknown[];
        nextPageToken?: string;
      };

      const entities = response.customBiddingAlgorithms || [];
      setSpanAttribute("dv360.resultCount", entities.length);

      return {
        entities,
        nextPageToken: response.nextPageToken,
      };
    });
  }

  /**
   * Get a specific custom bidding rules resource
   * @param customBiddingAlgorithmId - The algorithm ID
   * @param customBiddingAlgorithmRulesId - The rules ID
   * @param context - Request context
   * @returns Rules resource with state and details
   */
  async getCustomBiddingRules(
    customBiddingAlgorithmId: string,
    customBiddingAlgorithmRulesId: string,
    context?: RequestContext
  ): Promise<CustomBiddingAlgorithmRules> {
    return withDV360ApiSpan("getCustomBiddingRules", customBiddingAlgorithmId, async () => {
      setSpanAttribute("dv360.customBiddingAlgorithmId", customBiddingAlgorithmId);
      setSpanAttribute("dv360.customBiddingAlgorithmRulesId", customBiddingAlgorithmRulesId);

      const path = `/customBiddingAlgorithms/${customBiddingAlgorithmId}/rules/${customBiddingAlgorithmRulesId}`;

      return (await this.httpClient.fetch(path, context)) as CustomBiddingAlgorithmRules;
    });
  }
}
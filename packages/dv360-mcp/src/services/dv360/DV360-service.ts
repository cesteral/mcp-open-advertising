import { injectable, inject } from "tsyringe";
import type { Logger } from "pino";
import { McpError, JsonRpcErrorCode } from "../../utils/errors/index.js";
import { RateLimiter } from "../../utils/security/rate-limiter.js";
import {
  getEntityConfigDynamic,
  getEntitySchemaForOperation,
} from "../../mcp-server/tools/utils/entity-mapping-dynamic.js";
import { fetchWithTimeout } from "../../utils/network/fetch-with-timeout.js";
import { withDV360ApiSpan, setSpanAttribute } from "../../utils/telemetry/index.js";
import type { RequestContext } from "../../utils/internal/request-context.js";
import type { AppConfig } from "../../config/index.js";
import * as tokens from "../../container/tokens.js";

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
@injectable()
export class DV360Service {
  private accessToken?: string;
  private tokenExpiry?: Date;

  constructor(
    @inject(tokens.Logger) private logger: Logger,
    @inject(tokens.AppConfig) private config: AppConfig,
    @inject(tokens.RateLimiterService) private rateLimiter: RateLimiter
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
      await this.ensureAuthenticated(context);

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

      const response = await this.fetch(path, context);

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
    await this.ensureAuthenticated(context);

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
    }

    const response = await this.fetch(path, context);

    // Validate with generated schema
    const schema = getEntitySchemaForOperation(entityType, "get");
    return schema.parse(response);
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
    await this.ensureAuthenticated(context);

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

    // Rate limit by advertiser
    if (ids.advertiserId) {
      await this.rateLimiter.consume(`dv360:${ids.advertiserId}`, 1);
    }

    const response = await this.fetch(basePath, context, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validated),
    });

    return schema.parse(response);
  }

  /**
   * Update entity with updateMask
   */
  async updateEntity(
    entityType: string,
    ids: Record<string, string>,
    data: Record<string, unknown>,
    updateMask: string,
    context?: RequestContext
  ): Promise<unknown> {
    return withDV360ApiSpan("updateEntity", entityType, async () => {
      await this.ensureAuthenticated(context);

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

      // Get current entity and merge with updates
      const current = (await this.getEntity(entityType, ids, context)) as Record<string, any>;
      const merged = { ...current, ...data };

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

      const response = await this.fetch(path, context, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
      });

      return schema.parse(response);
    });
  }

  /**
   * Delete entity
   */
  async deleteEntity(
    entityType: string,
    ids: Record<string, string>,
    context?: RequestContext
  ): Promise<void> {
    await this.ensureAuthenticated(context);

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

    // Rate limit by advertiser
    if (ids.advertiserId) {
      await this.rateLimiter.consume(`dv360:${ids.advertiserId}`, 1);
    }

    await this.fetch(path, context, { method: "DELETE" });
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
      await this.ensureAuthenticated(context);

      setSpanAttribute("dv360.customBiddingAlgorithmId", customBiddingAlgorithmId);
      setSpanAttribute("dv360.scriptLength", scriptContent.length);

      // Upload endpoint is different from main API
      const uploadUrl = `https://displayvideo.googleapis.com/upload/displayvideo/v4/customBiddingAlgorithms/${customBiddingAlgorithmId}:uploadScript`;

      this.logger.debug(
        { uploadUrl, algorithmId: customBiddingAlgorithmId, requestId: context?.requestId },
        "Uploading custom bidding script"
      );

      const response = await fetchWithTimeout(uploadUrl, 30000, context, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
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
      await this.ensureAuthenticated(context);

      setSpanAttribute("dv360.customBiddingAlgorithmId", customBiddingAlgorithmId);

      const path = `/customBiddingAlgorithms/${customBiddingAlgorithmId}/scripts`;

      const response = await this.fetch(path, context, {
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
      await this.ensureAuthenticated(context);

      setSpanAttribute("dv360.customBiddingAlgorithmId", customBiddingAlgorithmId);

      const params = new URLSearchParams();
      if (pageToken) params.append("pageToken", pageToken);
      if (pageSize) params.append("pageSize", pageSize.toString());

      const path = `/customBiddingAlgorithms/${customBiddingAlgorithmId}/scripts${params.toString() ? `?${params}` : ""}`;

      const response = (await this.fetch(path, context)) as {
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
      await this.ensureAuthenticated(context);

      setSpanAttribute("dv360.customBiddingAlgorithmId", customBiddingAlgorithmId);
      setSpanAttribute("dv360.customBiddingScriptId", customBiddingScriptId);

      const path = `/customBiddingAlgorithms/${customBiddingAlgorithmId}/scripts/${customBiddingScriptId}`;

      return (await this.fetch(path, context)) as CustomBiddingScript;
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
      await this.ensureAuthenticated(context);

      setSpanAttribute("dv360.customBiddingAlgorithmId", customBiddingAlgorithmId);
      setSpanAttribute("dv360.rulesLength", rulesContent.length);

      const uploadUrl = `https://displayvideo.googleapis.com/upload/displayvideo/v4/customBiddingAlgorithms/${customBiddingAlgorithmId}:uploadRules`;

      this.logger.debug(
        { uploadUrl, algorithmId: customBiddingAlgorithmId, requestId: context?.requestId },
        "Uploading custom bidding rules"
      );

      const response = await fetchWithTimeout(uploadUrl, 30000, context, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
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
      await this.ensureAuthenticated(context);

      setSpanAttribute("dv360.customBiddingAlgorithmId", customBiddingAlgorithmId);

      const path = `/customBiddingAlgorithms/${customBiddingAlgorithmId}/rules`;

      const response = await this.fetch(path, context, {
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
      await this.ensureAuthenticated(context);

      setSpanAttribute("dv360.customBiddingAlgorithmId", customBiddingAlgorithmId);

      const params = new URLSearchParams();
      if (pageToken) params.append("pageToken", pageToken);
      if (pageSize) params.append("pageSize", pageSize.toString());

      const path = `/customBiddingAlgorithms/${customBiddingAlgorithmId}/rules${params.toString() ? `?${params}` : ""}`;

      const response = (await this.fetch(path, context)) as {
        customBiddingRules?: CustomBiddingAlgorithmRules[];
        nextPageToken?: string;
      };

      setSpanAttribute("dv360.resultCount", response.customBiddingRules?.length ?? 0);

      return {
        rules: response.customBiddingRules || [],
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
      await this.ensureAuthenticated(context);

      setSpanAttribute("dv360.customBiddingAlgorithmId", customBiddingAlgorithmId);
      setSpanAttribute("dv360.customBiddingAlgorithmRulesId", customBiddingAlgorithmRulesId);

      const path = `/customBiddingAlgorithms/${customBiddingAlgorithmId}/rules/${customBiddingAlgorithmRulesId}`;

      return (await this.fetch(path, context)) as CustomBiddingAlgorithmRules;
    });
  }

  /**
   * Private helper: Make authenticated fetch request
   */
  private async fetch(
    path: string,
    context?: RequestContext,
    options?: RequestInit
  ): Promise<unknown> {
    const url = `${this.config.dv360ApiBaseUrl}${path}`;

    this.logger.debug(
      { url, method: options?.method || "GET", requestId: context?.requestId },
      "Making DV360 API request"
    );

    const response = await fetchWithTimeout(url, 10000, context, {
      ...options,
      headers: {
        ...options?.headers,
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");

      throw new McpError(
        response.status >= 500
          ? JsonRpcErrorCode.ServiceUnavailable
          : JsonRpcErrorCode.InvalidRequest,
        `DV360 API request failed: ${response.status} ${response.statusText}`,
        {
          requestId: context?.requestId,
          httpStatus: response.status,
          path,
          method: options?.method ?? "GET",
          errorBody: errorBody.substring(0, 500), // Limit error body size
        }
      );
    }

    // DELETE returns 204 No Content
    if (response.status === 204) {
      return {};
    }

    return response.json();
  }

  /**
   * Ensure service account is authenticated
   */
  private async ensureAuthenticated(context?: RequestContext): Promise<void> {
    if (!this.accessToken || !this.tokenExpiry || this.tokenExpiry < new Date()) {
      await this.authenticateServiceAccount(context);
    }
  }

  /**
   * Authenticate using service account credentials
   */
  private async authenticateServiceAccount(context?: RequestContext): Promise<void> {
    this.logger.info({ requestId: context?.requestId }, "Authenticating with DV360 API");

    // Check if service account credentials are provided
    if (!this.config.dv360ServiceAccountJson && !this.config.dv360ServiceAccountFile) {
      throw new McpError(
        JsonRpcErrorCode.InternalError,
        "DV360 service account credentials not configured",
        { requestId: context?.requestId }
      );
    }

    try {
      let credentialsJson: string;

      // Load credentials from file or base64 string
      if (this.config.dv360ServiceAccountFile) {
        this.logger.debug(
          { file: this.config.dv360ServiceAccountFile },
          "Loading service account from file"
        );
        const { readFileSync } = await import("fs");
        credentialsJson = readFileSync(this.config.dv360ServiceAccountFile, "utf-8");
      } else {
        // Decode base64 service account JSON
        credentialsJson = Buffer.from(this.config.dv360ServiceAccountJson!, "base64").toString();
      }

      const credentials = JSON.parse(credentialsJson);

      // Create JWT assertion
      const now = Math.floor(Date.now() / 1000);
      const jwtHeader = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString(
        "base64url"
      );

      const jwtPayload = Buffer.from(
        JSON.stringify({
          iss: credentials.client_email,
          scope: "https://www.googleapis.com/auth/display-video",
          aud: "https://oauth2.googleapis.com/token",
          exp: now + 3600,
          iat: now,
        })
      ).toString("base64url");

      // Sign with private key (simplified - in production use proper JWT library)
      const crypto = await import("crypto");
      const signature = crypto
        .createSign("RSA-SHA256")
        .update(`${jwtHeader}.${jwtPayload}`)
        .sign(credentials.private_key, "base64url");

      const assertion = `${jwtHeader}.${jwtPayload}.${signature}`;

      // Exchange for access token
      const tokenResponse = await fetchWithTimeout(
        "https://oauth2.googleapis.com/token",
        5000,
        context,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
            assertion,
          }),
        }
      );

      if (!tokenResponse.ok) {
        throw new Error(
          `OAuth2 token exchange failed: ${tokenResponse.status} ${tokenResponse.statusText}`
        );
      }

      const tokenData = (await tokenResponse.json()) as {
        access_token: string;
        expires_in: number;
      };

      this.accessToken = tokenData.access_token;
      this.tokenExpiry = new Date(Date.now() + tokenData.expires_in * 1000);

      this.logger.info(
        { expiresAt: this.tokenExpiry, requestId: context?.requestId },
        "DV360 authentication successful"
      );
    } catch (error) {
      this.logger.error({ error, requestId: context?.requestId }, "DV360 authentication failed");
      throw new McpError(
        JsonRpcErrorCode.InternalError,
        "Failed to authenticate with DV360 API",
        { requestId: context?.requestId },
        { cause: error }
      );
    }
  }
}

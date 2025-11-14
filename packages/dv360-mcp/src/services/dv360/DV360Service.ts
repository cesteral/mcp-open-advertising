import { injectable, inject } from "tsyringe";
import type { Logger } from "pino";
import { McpError, JsonRpcErrorCode } from "../../utils/errors/index.js";
import { RateLimiter } from "../../utils/security/rateLimiter.js";
import {
  getEntityConfigDynamic,
  getEntitySchemaForOperation,
} from "../../mcp-server/tools/utils/entityMappingDynamic.js";
import { fetchWithTimeout } from "../../utils/network/fetchWithTimeout.js";
import { withDV360ApiSpan, setSpanAttribute } from "../../utils/telemetry/index.js";
import type { RequestContext } from "../../utils/internal/requestContext.js";
import type { AppConfig } from "../../config/index.js";
import * as tokens from "../../container/tokens.js";

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
    context?: RequestContext
  ): Promise<{ entities: unknown[]; nextPageToken?: string }> {
    return withDV360ApiSpan("listEntities", entityType, async () => {
      await this.ensureAuthenticated(context);

      const config = getEntityConfigDynamic(entityType);

      // Construct API path
      const basePath =
        typeof config.apiPath === "function" ? config.apiPath(ids) : config.apiPath;

      // Build query params
      const params = new URLSearchParams();
      if (filter && config.supportsFilter) {
        params.append("filter", filter);
        setSpanAttribute("dv360.filter", filter);
      }
      if (pageToken) {
        params.append("pageToken", pageToken);
        setSpanAttribute("dv360.pageToken", "present");
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
    const basePath =
      typeof config.apiPath === "function" ? config.apiPath(ids) : config.apiPath;
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

    const basePath =
      typeof config.apiPath === "function" ? config.apiPath(ids) : config.apiPath;

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
      const current = (await this.getEntity(entityType, ids, context)) as Record<
        string,
        any
      >;
      const merged = { ...current, ...data };

      // Validate merged entity
      const schema = getEntitySchemaForOperation(entityType, "update");
      const validated = schema.parse(merged);

      const basePath =
        typeof config.apiPath === "function" ? config.apiPath(ids) : config.apiPath;
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

    const basePath =
      typeof config.apiPath === "function" ? config.apiPath(ids) : config.apiPath;
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

    // Check if service account JSON is provided
    if (!this.config.dv360ServiceAccountJson) {
      throw new McpError(
        JsonRpcErrorCode.InternalError,
        "DV360 service account credentials not configured",
        { requestId: context?.requestId }
      );
    }

    try {
      // Decode base64 service account JSON
      const credentials = JSON.parse(
        Buffer.from(this.config.dv360ServiceAccountJson, "base64").toString()
      );

      // Create JWT assertion
      const now = Math.floor(Date.now() / 1000);
      const jwtHeader = Buffer.from(
        JSON.stringify({ alg: "RS256", typ: "JWT" })
      ).toString("base64url");

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

import { injectable, inject } from 'tsyringe';
import type { Logger } from 'pino';
import { McpError, JsonRpcErrorCode } from '../../utils/errors/index.js';
import { RateLimiter } from '../../utils/security/rate-limiter.js';
import { fetchWithTimeout } from '../../utils/network/fetch-with-timeout.js';
import { withDV360ApiSpan, setSpanAttribute } from '../../utils/telemetry/index.js';
import type { RequestContext } from '../../utils/internal/request-context.js';
import type { AppConfig } from '../../config/index.js';
import * as tokens from '../../container/tokens.js';
import {
  type TargetingType,
  type TargetingParentType,
  buildTargetingApiPath,
  validateTargetingIds,
  isValidTargetingType,
  isValidTargetingParentType,
  getEntityIdField,
  TARGETING_PARENT_TYPES,
} from '../../mcp-server/tools/utils/targeting-metadata.js';

/**
 * Response from list targeting options
 */
export interface ListTargetingOptionsResult {
  assignedTargetingOptions: unknown[];
  nextPageToken?: string;
}

/**
 * Service for interacting with DV360 Assigned Targeting Options API
 *
 * Provides full CRUD operations for targeting options on:
 * - Insertion Orders
 * - Line Items
 * - Ad Groups
 */
@injectable()
export class TargetingService {
  private accessToken?: string;
  private tokenExpiry?: Date;

  constructor(
    @inject(tokens.Logger) private logger: Logger,
    @inject(tokens.AppConfig) private config: AppConfig,
    @inject(tokens.RateLimiterService) private rateLimiter: RateLimiter
  ) {}

  /**
   * List assigned targeting options for a parent entity
   */
  async listAssignedTargetingOptions(
    parentType: TargetingParentType,
    ids: Record<string, string>,
    targetingType: TargetingType,
    pageToken?: string,
    pageSize?: number,
    context?: RequestContext
  ): Promise<ListTargetingOptionsResult> {
    return withDV360ApiSpan('listAssignedTargetingOptions', parentType, async () => {
      await this.ensureAuthenticated(context);

      // Validate targeting type
      if (!isValidTargetingType(targetingType)) {
        throw new McpError(
          JsonRpcErrorCode.InvalidParams,
          `Invalid targeting type: ${targetingType}`,
          { targetingType, requestId: context?.requestId }
        );
      }

      // Validate required IDs
      const validation = validateTargetingIds(parentType, ids);
      if (!validation.valid) {
        throw new McpError(
          JsonRpcErrorCode.InvalidParams,
          `Missing required IDs for ${parentType}: ${validation.missingIds.join(', ')}`,
          {
            parentType,
            requiredIds: TARGETING_PARENT_TYPES[parentType].requiredIds,
            providedIds: Object.keys(ids),
            requestId: context?.requestId,
          }
        );
      }

      // Build API path
      const basePath = buildTargetingApiPath(parentType, ids, targetingType);
      setSpanAttribute('dv360.apiPath', basePath);
      setSpanAttribute('dv360.targetingType', targetingType);
      setSpanAttribute('dv360.parentType', parentType);

      // Build query params
      const params = new URLSearchParams();
      if (pageToken) {
        params.append('pageToken', pageToken);
        setSpanAttribute('dv360.pageToken', 'present');
      }
      if (pageSize) {
        params.append('pageSize', pageSize.toString());
        setSpanAttribute('dv360.pageSize', pageSize);
      }

      const path = `${basePath}${params.toString() ? `?${params.toString()}` : ''}`;

      // Rate limit by advertiser
      await this.rateLimiter.consume(`dv360:${ids.advertiserId}`, 1);
      setSpanAttribute('dv360.advertiserId', ids.advertiserId);

      const response = await this.fetch(path, context);

      const result = response as {
        assignedTargetingOptions?: unknown[];
        nextPageToken?: string;
      };

      setSpanAttribute('dv360.resultCount', result.assignedTargetingOptions?.length ?? 0);

      return {
        assignedTargetingOptions: result.assignedTargetingOptions ?? [],
        nextPageToken: result.nextPageToken,
      };
    });
  }

  /**
   * Get a single assigned targeting option
   */
  async getAssignedTargetingOption(
    parentType: TargetingParentType,
    ids: Record<string, string>,
    targetingType: TargetingType,
    assignedTargetingOptionId: string,
    context?: RequestContext
  ): Promise<unknown> {
    return withDV360ApiSpan('getAssignedTargetingOption', parentType, async () => {
      await this.ensureAuthenticated(context);

      // Validate targeting type
      if (!isValidTargetingType(targetingType)) {
        throw new McpError(
          JsonRpcErrorCode.InvalidParams,
          `Invalid targeting type: ${targetingType}`,
          { targetingType, requestId: context?.requestId }
        );
      }

      // Validate required IDs
      const validation = validateTargetingIds(parentType, ids);
      if (!validation.valid) {
        throw new McpError(
          JsonRpcErrorCode.InvalidParams,
          `Missing required IDs for ${parentType}: ${validation.missingIds.join(', ')}`,
          {
            parentType,
            requiredIds: TARGETING_PARENT_TYPES[parentType].requiredIds,
            providedIds: Object.keys(ids),
            requestId: context?.requestId,
          }
        );
      }

      // Build API path with option ID
      const path = buildTargetingApiPath(parentType, ids, targetingType, assignedTargetingOptionId);
      setSpanAttribute('dv360.apiPath', path);
      setSpanAttribute('dv360.targetingType', targetingType);
      setSpanAttribute('dv360.parentType', parentType);
      setSpanAttribute('dv360.assignedTargetingOptionId', assignedTargetingOptionId);

      // Rate limit by advertiser
      await this.rateLimiter.consume(`dv360:${ids.advertiserId}`, 1);
      setSpanAttribute('dv360.advertiserId', ids.advertiserId);

      return this.fetch(path, context);
    });
  }

  /**
   * Create a new assigned targeting option
   */
  async createAssignedTargetingOption(
    parentType: TargetingParentType,
    ids: Record<string, string>,
    targetingType: TargetingType,
    data: Record<string, unknown>,
    context?: RequestContext
  ): Promise<unknown> {
    return withDV360ApiSpan('createAssignedTargetingOption', parentType, async () => {
      await this.ensureAuthenticated(context);

      // Validate targeting type
      if (!isValidTargetingType(targetingType)) {
        throw new McpError(
          JsonRpcErrorCode.InvalidParams,
          `Invalid targeting type: ${targetingType}`,
          { targetingType, requestId: context?.requestId }
        );
      }

      // Validate required IDs
      const validation = validateTargetingIds(parentType, ids);
      if (!validation.valid) {
        throw new McpError(
          JsonRpcErrorCode.InvalidParams,
          `Missing required IDs for ${parentType}: ${validation.missingIds.join(', ')}`,
          {
            parentType,
            requiredIds: TARGETING_PARENT_TYPES[parentType].requiredIds,
            providedIds: Object.keys(ids),
            requestId: context?.requestId,
          }
        );
      }

      // Build API path
      const path = buildTargetingApiPath(parentType, ids, targetingType);
      setSpanAttribute('dv360.apiPath', path);
      setSpanAttribute('dv360.targetingType', targetingType);
      setSpanAttribute('dv360.parentType', parentType);
      setSpanAttribute('dv360.operation', 'create');

      // Rate limit by advertiser
      await this.rateLimiter.consume(`dv360:${ids.advertiserId}`, 1);
      setSpanAttribute('dv360.advertiserId', ids.advertiserId);

      return this.fetch(path, context, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    });
  }

  /**
   * Delete an assigned targeting option
   */
  async deleteAssignedTargetingOption(
    parentType: TargetingParentType,
    ids: Record<string, string>,
    targetingType: TargetingType,
    assignedTargetingOptionId: string,
    context?: RequestContext
  ): Promise<void> {
    return withDV360ApiSpan('deleteAssignedTargetingOption', parentType, async () => {
      await this.ensureAuthenticated(context);

      // Validate targeting type
      if (!isValidTargetingType(targetingType)) {
        throw new McpError(
          JsonRpcErrorCode.InvalidParams,
          `Invalid targeting type: ${targetingType}`,
          { targetingType, requestId: context?.requestId }
        );
      }

      // Validate required IDs
      const validation = validateTargetingIds(parentType, ids);
      if (!validation.valid) {
        throw new McpError(
          JsonRpcErrorCode.InvalidParams,
          `Missing required IDs for ${parentType}: ${validation.missingIds.join(', ')}`,
          {
            parentType,
            requiredIds: TARGETING_PARENT_TYPES[parentType].requiredIds,
            providedIds: Object.keys(ids),
            requestId: context?.requestId,
          }
        );
      }

      // Build API path with option ID
      const path = buildTargetingApiPath(parentType, ids, targetingType, assignedTargetingOptionId);
      setSpanAttribute('dv360.apiPath', path);
      setSpanAttribute('dv360.targetingType', targetingType);
      setSpanAttribute('dv360.parentType', parentType);
      setSpanAttribute('dv360.assignedTargetingOptionId', assignedTargetingOptionId);
      setSpanAttribute('dv360.operation', 'delete');

      // Rate limit by advertiser
      await this.rateLimiter.consume(`dv360:${ids.advertiserId}`, 1);
      setSpanAttribute('dv360.advertiserId', ids.advertiserId);

      await this.fetch(path, context, { method: 'DELETE' });
    });
  }

  /**
   * Validate targeting configuration for multiple entities
   * Returns a validation report with any issues found
   *
   * @param advertiserId - DV360 Advertiser ID
   * @param entityIds - Map of parentType to array of entity IDs (e.g., { insertionOrder: ['123'], lineItem: ['456'] })
   * @param targetingTypesToCheck - Array of targeting types to validate
   * @param context - Request context for tracing
   */
  async validateTargetingConfig(
    advertiserId: string,
    entityIds: Record<string, string[]>,
    targetingTypesToCheck: TargetingType[],
    context?: RequestContext
  ): Promise<{
    valid: boolean;
    issues: Array<{
      entityType: TargetingParentType;
      entityId: string;
      targetingType: TargetingType;
      issue: string;
      severity: 'error' | 'warning' | 'info';
    }>;
    summary: {
      totalEntitiesChecked: number;
      totalTargetingOptionsFound: number;
      issueCount: number;
    };
  }> {
    const issues: Array<{
      entityType: TargetingParentType;
      entityId: string;
      targetingType: TargetingType;
      issue: string;
      severity: 'error' | 'warning' | 'info';
    }> = [];

    let totalEntitiesChecked = 0;
    let totalTargetingOptionsFound = 0;

    const checkEntity = async (parentType: TargetingParentType, entityId: string) => {
      totalEntitiesChecked++;
      const entityIdField = getEntityIdField(parentType);
      const ids: Record<string, string> = {
        advertiserId,
        [entityIdField]: entityId,
      };

      for (const targetingType of targetingTypesToCheck) {
        try {
          const result = await this.listAssignedTargetingOptions(
            parentType,
            ids,
            targetingType,
            undefined,
            100,
            context
          );

          totalTargetingOptionsFound += result.assignedTargetingOptions.length;

          // Check for common issues based on targeting type
          if (
            targetingType === 'TARGETING_TYPE_GEO_REGION' &&
            result.assignedTargetingOptions.length === 0
          ) {
            issues.push({
              entityType: parentType,
              entityId,
              targetingType,
              issue: 'No geographic targeting configured - ads may serve worldwide',
              severity: 'warning',
            });
          }

          if (
            targetingType === 'TARGETING_TYPE_CHANNEL' &&
            parentType === 'insertionOrder' &&
            result.assignedTargetingOptions.length === 0
          ) {
            issues.push({
              entityType: parentType,
              entityId,
              targetingType,
              issue: 'No channel exclusions at IO level - consider adding brand safety exclusions',
              severity: 'info',
            });
          }
        } catch (error) {
          this.logger.warn(
            { error, entityType: parentType, entityId, targetingType },
            'Failed to check targeting'
          );
          issues.push({
            entityType: parentType,
            entityId,
            targetingType,
            issue: `Failed to retrieve targeting: ${error instanceof Error ? error.message : 'Unknown error'}`,
            severity: 'error',
          });
        }
      }
    };

    // Iterate over all provided parent types dynamically
    for (const [parentType, ids] of Object.entries(entityIds)) {
      if (!isValidTargetingParentType(parentType)) {
        this.logger.warn({ parentType }, 'Unknown parent type in entityIds, skipping');
        continue;
      }
      for (const entityId of ids) {
        await checkEntity(parentType, entityId);
      }
    }

    return {
      valid: issues.filter((i) => i.severity === 'error').length === 0,
      issues,
      summary: {
        totalEntitiesChecked,
        totalTargetingOptionsFound,
        issueCount: issues.length,
      },
    };
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
      { url, method: options?.method || 'GET', requestId: context?.requestId },
      'Making DV360 Targeting API request'
    );

    const response = await fetchWithTimeout(url, 10000, context, {
      ...options,
      headers: {
        ...options?.headers,
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');

      throw new McpError(
        response.status >= 500 ? JsonRpcErrorCode.ServiceUnavailable : JsonRpcErrorCode.InvalidRequest,
        `DV360 API request failed: ${response.status} ${response.statusText}`,
        {
          requestId: context?.requestId,
          httpStatus: response.status,
          path,
          method: options?.method ?? 'GET',
          errorBody: errorBody.substring(0, 500),
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
    this.logger.info({ requestId: context?.requestId }, 'Authenticating with DV360 API');

    // Check if service account credentials are provided
    if (!this.config.dv360ServiceAccountJson && !this.config.dv360ServiceAccountFile) {
      throw new McpError(JsonRpcErrorCode.InternalError, 'DV360 service account credentials not configured', {
        requestId: context?.requestId,
      });
    }

    try {
      let credentialsJson: string;

      // Load credentials from file or base64 string
      if (this.config.dv360ServiceAccountFile) {
        this.logger.debug({ file: this.config.dv360ServiceAccountFile }, 'Loading service account from file');
        const { readFileSync } = await import('fs');
        credentialsJson = readFileSync(this.config.dv360ServiceAccountFile, 'utf-8');
      } else {
        // Decode base64 service account JSON
        credentialsJson = Buffer.from(this.config.dv360ServiceAccountJson!, 'base64').toString();
      }

      const credentials = JSON.parse(credentialsJson);

      // Create JWT assertion
      const now = Math.floor(Date.now() / 1000);
      const jwtHeader = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');

      const jwtPayload = Buffer.from(
        JSON.stringify({
          iss: credentials.client_email,
          scope: 'https://www.googleapis.com/auth/display-video',
          aud: 'https://oauth2.googleapis.com/token',
          exp: now + 3600,
          iat: now,
        })
      ).toString('base64url');

      // Sign with private key
      const crypto = await import('crypto');
      const signature = crypto
        .createSign('RSA-SHA256')
        .update(`${jwtHeader}.${jwtPayload}`)
        .sign(credentials.private_key, 'base64url');

      const assertion = `${jwtHeader}.${jwtPayload}.${signature}`;

      // Exchange for access token
      const tokenResponse = await fetchWithTimeout('https://oauth2.googleapis.com/token', 5000, context, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion,
        }),
      });

      if (!tokenResponse.ok) {
        throw new Error(`OAuth2 token exchange failed: ${tokenResponse.status} ${tokenResponse.statusText}`);
      }

      const tokenData = (await tokenResponse.json()) as {
        access_token: string;
        expires_in: number;
      };

      this.accessToken = tokenData.access_token;
      this.tokenExpiry = new Date(Date.now() + tokenData.expires_in * 1000);

      this.logger.info(
        { expiresAt: this.tokenExpiry, requestId: context?.requestId },
        'DV360 authentication successful'
      );
    } catch (error) {
      this.logger.error({ error, requestId: context?.requestId }, 'DV360 authentication failed');
      throw new McpError(JsonRpcErrorCode.InternalError, 'Failed to authenticate with DV360 API', {
        requestId: context?.requestId,
      });
    }
  }
}

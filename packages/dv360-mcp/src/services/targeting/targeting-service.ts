import type { Logger } from 'pino';
import { McpError, JsonRpcErrorCode } from '../../utils/errors/index.js';
import { RateLimiter } from '../../utils/security/rate-limiter.js';
import { withDV360ApiSpan, setSpanAttribute } from '../../utils/telemetry/index.js';
import type { RequestContext } from "@cesteral/shared";
import { DV360HttpClient } from '../dv360/dv360-http-client.js';
import {
  type TargetingType,
  type TargetingParentType,
  buildTargetingApiPath,
  validateTargetingIds,
  isValidTargetingType,
  isValidTargetingParentType,
  getEntityIdField,
  TARGETING_PARENT_TYPES,
} from '../domain/targeting-metadata.js';

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
export class TargetingService {
  constructor(
    private logger: Logger,
    private rateLimiter: RateLimiter,
    private httpClient: DV360HttpClient
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

      const response = await this.httpClient.fetch(path, context);

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

      return this.httpClient.fetch(path, context);
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

      return this.httpClient.fetch(path, context, {
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

      await this.httpClient.fetch(path, context, { method: 'DELETE' });
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
}

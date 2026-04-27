// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { getEntityConfig, type ParentIdKey, type GAdsEntityType } from "./entity-mapping.js";

/** Entity types that require composite IDs (e.g., {adGroupId}~{adId}) */
const COMPOSITE_ID_ENTITIES: Record<string, string> = {
  ad: "{adGroupId}~{adId}",
  keyword: "{adGroupId}~{criterionId}",
};

/**
 * Validates that a composite ID has exactly two non-empty numeric segments
 * separated by a single tilde: "{digits}~{digits}"
 */
const COMPOSITE_ID_PATTERN = /^\d+~\d+$/;

/**
 * Google Ads entities all require a customerId.
 * Some also require campaignId or adGroupId depending on the entity hierarchy.
 *
 * For Google Ads REST API, the customerId is always required since
 * all API paths are scoped to /customers/{customerId}/...
 */

export function getRequiredParentIds(entityType: GAdsEntityType): ParentIdKey[] {
  return [...getEntityConfig(entityType).parentIds];
}

export function getMissingParentIds(
  entityType: GAdsEntityType,
  input: Record<string, unknown>
): ParentIdKey[] {
  const required = getRequiredParentIds(entityType);
  return required.filter((parentId) => {
    const value = input[parentId];
    return !value || (typeof value === "string" && value.trim().length === 0);
  });
}

export function buildMissingParentIdsMessage(
  entityType: GAdsEntityType,
  missing: ParentIdKey[]
): string {
  const requiredFields = getRequiredParentIds(entityType).map((key) => `\`${key}\``);
  const missingFields = missing.map((key) => `\`${key}\``);

  return `Missing required parent identifier(s) for entity type "${entityType}": ${missingFields.join(", ")}. Required parent identifiers: ${requiredFields.join(", ")}.`;
}

export interface ParentValidationOptions {
  /** Validate composite ID format for ad/keyword (needed for mutate operations, not GAQL reads) */
  validateCompositeIds?: boolean;
}

export function addParentValidationIssue(
  ctx: z.RefinementCtx,
  entityType: GAdsEntityType,
  input: Record<string, unknown>,
  path: Array<string | number> = [],
  options?: ParentValidationOptions
): void {
  const missing = getMissingParentIds(entityType, input);
  if (missing.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path,
      message: buildMissingParentIdsMessage(entityType, missing),
    });
  }

  // Validate composite entityId format for ad and keyword types
  // Only for mutate operations — GAQL reads use simple IDs
  if (options?.validateCompositeIds) {
    const compositeFormat = COMPOSITE_ID_ENTITIES[entityType];
    if (compositeFormat) {
      const entityId = input.entityId as string | undefined;
      if (entityId && !COMPOSITE_ID_PATTERN.test(entityId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [...path, "entityId"],
          message: `Entity type "${entityType}" requires a composite entityId in the format ${compositeFormat} (two numeric IDs separated by ~), but got "${entityId}".`,
        });
      }

      // Also validate composite IDs in entityIds arrays (for bulk operations)
      const entityIds = input.entityIds as string[] | undefined;
      if (Array.isArray(entityIds)) {
        for (let i = 0; i < entityIds.length; i++) {
          if (!COMPOSITE_ID_PATTERN.test(entityIds[i])) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [...path, "entityIds", i],
              message: `Entity type "${entityType}" requires composite IDs in the format ${compositeFormat} (two numeric IDs separated by ~), but entityIds[${i}] = "${entityIds[i]}".`,
            });
          }
        }
      }
    }
  }
}

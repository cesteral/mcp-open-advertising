import { z } from "zod";
import {
  getEntityConfig,
  type ParentIdKey,
  type GAdsEntityType,
} from "./entity-mapping.js";

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
  const requiredFields = getRequiredParentIds(entityType).map(
    (key) => `\`${key}\``
  );
  const missingFields = missing.map((key) => `\`${key}\``);

  return `Missing required parent identifier(s) for entity type "${entityType}": ${missingFields.join(", ")}. Required parent identifiers: ${requiredFields.join(", ")}.`;
}

export function addParentValidationIssue(
  ctx: z.RefinementCtx,
  entityType: GAdsEntityType,
  input: Record<string, unknown>,
  path: Array<string | number> = []
): void {
  const missing = getMissingParentIds(entityType, input);
  if (missing.length === 0) {
    return;
  }

  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path,
    message: buildMissingParentIdsMessage(entityType, missing),
  });
}

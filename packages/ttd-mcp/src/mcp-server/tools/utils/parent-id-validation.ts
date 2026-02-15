import { z } from "zod";
import {
  getEntityConfig,
  type ParentIdKey,
  type TtdEntityType,
} from "./entity-mapping.js";

type ParentValueMap = Partial<Record<ParentIdKey, string>>;

const parentPayloadFieldMap: Record<ParentIdKey, string> = {
  advertiserId: "AdvertiserId",
  campaignId: "CampaignId",
  adGroupId: "AdGroupId",
};

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function getRequiredParentIds(entityType: TtdEntityType): ParentIdKey[] {
  return [...getEntityConfig(entityType).parentIds];
}

export function extractParentIds(
  input: Record<string, unknown>,
  data?: Record<string, unknown>
): ParentValueMap {
  const extracted: ParentValueMap = {};
  for (const parentId of Object.keys(parentPayloadFieldMap) as ParentIdKey[]) {
    extracted[parentId] =
      normalizeString(input[parentId]) ??
      normalizeString(data?.[parentPayloadFieldMap[parentId]]);
  }
  return extracted;
}

export function getMissingParentIds(
  entityType: TtdEntityType,
  input: Record<string, unknown>,
  data?: Record<string, unknown>
): ParentIdKey[] {
  const required = getRequiredParentIds(entityType);
  const extracted = extractParentIds(input, data);
  return required.filter((parentId) => !extracted[parentId]);
}

export function buildMissingParentIdsMessage(
  entityType: TtdEntityType,
  missing: ParentIdKey[]
): string {
  const requiredFields = getRequiredParentIds(entityType).map(
    (key) => `\`${key}\``
  );
  const missingFields = missing.map((key) => `\`${key}\``);
  const payloadHints = missing
    .map((key) => `\`${parentPayloadFieldMap[key]}\``)
    .join(", ");

  return `Missing required parent identifier(s) for entity type "${entityType}": ${missingFields.join(", ")}. Required parent identifiers: ${requiredFields.join(", ")}. Provide these as top-level params or in \`data\` using TTD fields (${payloadHints}).`;
}

export function addParentValidationIssue(
  ctx: z.RefinementCtx,
  entityType: TtdEntityType,
  input: Record<string, unknown>,
  data?: Record<string, unknown>,
  path: Array<string | number> = []
): void {
  const missing = getMissingParentIds(entityType, input, data);
  if (missing.length === 0) {
    return;
  }

  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path,
    message: buildMissingParentIdsMessage(entityType, missing),
  });
}

export function mergeParentIdsIntoData(
  data: Record<string, unknown>,
  input: Record<string, unknown>
): Record<string, unknown> {
  const merged = { ...data };
  const extracted = extractParentIds(input, merged);

  for (const parentId of Object.keys(parentPayloadFieldMap) as ParentIdKey[]) {
    const value = extracted[parentId];
    if (value) {
      merged[parentPayloadFieldMap[parentId]] = value;
    }
  }

  return merged;
}

import { z } from "zod";
import { getEntityConfigDynamic } from "./entity-mapping-dynamic.js";

const knownIdFields = [
  "partnerId",
  "advertiserId",
  "campaignId",
  "insertionOrderId",
  "lineItemId",
  "adGroupId",
  "adId",
  "creativeId",
] as const;

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function getKnownIdFields(input: Record<string, unknown>, data?: Record<string, unknown>): string[] {
  const fromInput = Object.keys(input).filter((key) => key.endsWith("Id"));
  const fromData = data ? Object.keys(data).filter((key) => key.endsWith("Id")) : [];
  return Array.from(new Set([...knownIdFields, ...fromInput, ...fromData]));
}

function resolveIdValue(
  idField: string,
  input: Record<string, unknown>,
  data?: Record<string, unknown>
): string | undefined {
  return normalizeString(input[idField]) ?? normalizeString(data?.[idField]);
}

export function mergeIdsIntoData(
  entityType: string,
  data: Record<string, unknown>,
  input: Record<string, unknown>
): Record<string, unknown> {
  const merged = { ...data };
  const config = getEntityConfigDynamic(entityType);
  const entityIdField = `${entityType}Id`;
  const idFields = new Set<string>([
    ...getKnownIdFields(input, data),
    ...config.parentIds,
    entityIdField,
  ]);

  for (const idField of idFields) {
    const resolved = resolveIdValue(idField, input, merged);
    if (resolved) {
      merged[idField] = resolved;
    }
  }

  return merged;
}

export function addIdValidationIssues(
  ctx: z.RefinementCtx,
  params: {
    entityType: string;
    input: Record<string, unknown>;
    data?: Record<string, unknown>;
    operation: "create" | "get" | "update" | "delete";
    requireEntityId: boolean;
    path?: Array<string | number>;
  }
): void {
  const { entityType, input, data, operation, requireEntityId, path = [] } = params;
  const config = getEntityConfigDynamic(entityType);
  const entityIdField = `${entityType}Id`;
  const requiredIds = [...config.parentIds, ...(requireEntityId ? [entityIdField] : [])];
  const missing = requiredIds.filter((idField) => !resolveIdValue(idField, input, data));

  if (missing.length === 0) {
    return;
  }

  const requiredText = requiredIds.map((idField) => `\`${idField}\``).join(", ");
  const missingText = missing.map((idField) => `\`${idField}\``).join(", ");
  const resourceUri = `entity-schema://${entityType}`;
  const hint =
    operation === "update"
      ? `Fetch \`entity-fields://${entityType}\` to verify update mask paths.`
      : `Fetch \`${resourceUri}\` for full field requirements.`;

  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path,
    message: `Missing required identifier(s) for ${operation} ${entityType}: ${missingText}. Required identifiers: ${requiredText}. Provide these IDs as top-level params or in \`data\` using DV360 field names. ${hint}`,
  });
}

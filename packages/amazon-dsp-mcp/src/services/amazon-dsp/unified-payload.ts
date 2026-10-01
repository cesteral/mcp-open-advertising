// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Pure request-body construction for the Unified API entity operations (#234).
 * No I/O — shared by the service (execute) and the symbolic dry-runs, so a
 * payload the dry-run reports "would FAIL" is the same payload execute refuses.
 *
 * Basis for every shape below: amzn/ads-advanced-tools-docs @
 * e25aace0ec07997c113dac48f333298472243558,
 * unified-campaign-management-migration-skills/api-specs/unified-api-dsp.json
 * (schema names cited inline) and skills/unified-dsp-cm-migration/SKILL.md.
 *
 * Legacy (`/dsp/*`) field names are mapped only where the mapping is
 * mechanical and the spec supports both ends:
 *   - parent-id renames (`orderId` → `campaignId`, `lineItemId` → `adGroupId`,
 *     `creativeId` → `adId`),
 *   - `advertiserId` → dropped (migration guide §4: "Derived from
 *     `Amazon-Ads-AccountId` header") — refused if it names another account,
 *   - `country: "US"` → `countries: ["US"]` (migration guide §4, string → array),
 *   - a legacy budget with an explicit DAILY / LIFETIME type → one
 *     `DSPCreateBudget` { budgetType: "MONETARY", budgetValue: { monetaryBudgetValue:
 *     { monetaryBudget: { value } } }, recurrenceTimePeriod }.
 * Legacy fields with no mechanical mapping are refused with a pointer to the
 * Unified field rather than silently forwarded or dropped.
 */

import {
  AMAZON_DSP_AD_PRODUCT,
  getAmazonDspEntityContract,
  type AmazonDspCanonicalEntityType,
} from "./amazon-dsp-api-contract.js";

export interface UnifiedPayloadIssue {
  code: string;
  message: string;
  field: string;
}

export interface UnifiedPayload {
  item: Record<string, unknown>;
  issues: UnifiedPayloadIssue[];
}

/** `DSPUpdateState` — the only states an update may set. */
export const UNIFIED_UPDATE_STATES = ["ENABLED", "PAUSED"] as const;
/** `DSPCreateState`. */
export const UNIFIED_CREATE_STATES = ["ENABLED", "PAUSED"] as const;

/**
 * Legacy fields that cannot be mapped mechanically, per entity type, with the
 * Unified field to use instead.
 */
const LEGACY_REFUSALS: Record<AmazonDspCanonicalEntityType, Record<string, string>> = {
  order: {
    startDateTime:
      "campaign dates are set per flight — use flights[].startDateTime (campaign startDateTime is read-only on DSPCampaign)",
    endDateTime:
      "campaign dates are set per flight — use flights[].endDateTime (campaign endDateTime is read-only on DSPCampaign)",
    optimization:
      "use `optimizations` { bidSettings: { bidStrategy }, goalSettings: { kpi } } (migration guide §4)",
    budgetCaps: "use `budgets[]` (migration guide §4)",
    budgetType:
      "a legacy order budget maps only as { budget: number, budgetType: 'DAILY' | 'LIFETIME' } together; otherwise use `budgets[]`",
    currencyCode:
      "Unified create budgets carry only `value` (DSPCreateMonetaryBudget); the currency is the advertiser account's",
  },
  lineItem: {
    bidding:
      "use `bid` { baseBid, maxAverageBid? } and `optimization` { bidStrategy } (DSPAdGroupCreate)",
    lineItemType: "use `inventoryType` (DSPAdGroupCreate)",
    targetingClauses: "create targets with entityType `target` (targetType + targetDetails)",
  },
  creative: {
    creativeType:
      "use `adType` (AUDIO | COMPONENT | DISPLAY | THIRD_PARTY | VIDEO) and one `creative` key (DSPAdCreate)",
  },
  target: {
    expression: "use `targetType` + `targetDetails` { <type>Target: {...} } (DSPTargetCreate)",
    expressionType: "use `targetType` + `targetDetails` { <type>Target: {...} } (DSPTargetCreate)",
  },
  creativeAssociation: {},
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** One `DSPCreateBudget` from a major-unit amount and a recurrence. */
export function unifiedMonetaryBudget(
  value: number,
  recurrenceTimePeriod: "DAILY" | "LIFETIME" | "MONTHLY"
): Record<string, unknown> {
  return {
    budgetType: "MONETARY",
    budgetValue: { monetaryBudgetValue: { monetaryBudget: { value } } },
    recurrenceTimePeriod,
  };
}

function mapAdvertiserId(
  item: Record<string, unknown>,
  accountId: string,
  issues: UnifiedPayloadIssue[]
): void {
  if (!("advertiserId" in item)) return;
  const advertiserId = item.advertiserId;
  delete item.advertiserId;
  if (advertiserId != null && String(advertiserId) !== accountId) {
    issues.push({
      code: "ACCOUNT_MISMATCH",
      message: `data.advertiserId (${String(advertiserId)}) names a different account than accountId (${accountId}). The Unified API has no advertiserId body field — the advertiser is the Amazon-Ads-AccountId header.`,
      field: "data.advertiserId",
    });
  }
}

function mapLegacyBudget(
  entityType: AmazonDspCanonicalEntityType,
  item: Record<string, unknown>,
  issues: UnifiedPayloadIssue[]
): void {
  if (!("budget" in item)) return;
  if (entityType !== "order" && entityType !== "lineItem") {
    return; // not a legacy field on the other types — forward untouched
  }
  const raw = item.budget;
  let value: unknown;
  let type: unknown;
  if (entityType === "order") {
    value = raw;
    type = item.budgetType;
  } else if (isRecord(raw)) {
    value = raw.budget;
    type = raw.budgetType;
  }
  const n = typeof value === "string" ? Number(value) : value;
  if (
    typeof n !== "number" ||
    !Number.isFinite(n) ||
    n < 0 ||
    (type !== "DAILY" && type !== "LIFETIME")
  ) {
    issues.push({
      code: "LEGACY_BUDGET_UNMAPPABLE",
      message:
        entityType === "order"
          ? "Legacy `budget` maps only as { budget: <non-negative number>, budgetType: 'DAILY' | 'LIFETIME' }. Otherwise send Unified `budgets[]`."
          : "Legacy `budget` maps only as { budget: { budgetType: 'DAILY' | 'LIFETIME', budget: <non-negative number> } }. Otherwise send Unified `budgets[]`.",
      field: "data.budget",
    });
    return;
  }
  if ("budgets" in item) {
    issues.push({
      code: "CONFLICTING_FIELDS",
      message: "Send either legacy `budget` or Unified `budgets[]`, not both.",
      field: "data.budget",
    });
    return;
  }
  item.budgets = [unifiedMonetaryBudget(n, type)];
  delete item.budget;
  if (entityType === "order") delete item.budgetType;
}

function applyLegacyMappings(
  entityType: AmazonDspCanonicalEntityType,
  item: Record<string, unknown>,
  accountId: string,
  issues: UnifiedPayloadIssue[],
  opts: { renameParents: boolean }
): void {
  const contract = getAmazonDspEntityContract(entityType);
  mapAdvertiserId(item, accountId, issues);

  if (opts.renameParents) {
    for (const [legacy, unified] of Object.entries(contract.legacyFieldRenames)) {
      if (!(legacy in item)) continue;
      if (unified in item && String(item[unified]) !== String(item[legacy])) {
        issues.push({
          code: "CONFLICTING_FIELDS",
          message: `data.${legacy} (legacy) and data.${unified} disagree — send only \`${unified}\`.`,
          field: `data.${legacy}`,
        });
        continue;
      }
      item[unified] = item[legacy];
      delete item[legacy];
    }
  }

  if (entityType === "order" && typeof item.country === "string") {
    if (!("countries" in item)) item.countries = [item.country];
    delete item.country;
  }

  mapLegacyBudget(entityType, item, issues);

  for (const [legacy, hint] of Object.entries(LEGACY_REFUSALS[entityType])) {
    if (legacy in item) {
      issues.push({
        code: "LEGACY_FIELD",
        message: `data.${legacy} is a pre-Unified /dsp field with no mechanical mapping: ${hint}.`,
        field: `data.${legacy}`,
      });
    }
  }
}

function checkBudgets(item: Record<string, unknown>, issues: UnifiedPayloadIssue[]): void {
  if (!Array.isArray(item.budgets)) return;
  item.budgets.forEach((b, i) => {
    const value = isRecord(b)
      ? (b as any)?.budgetValue?.monetaryBudgetValue?.monetaryBudget?.value
      : undefined;
    if (value === undefined) return;
    const n = typeof value === "string" ? Number(value) : value;
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0) {
      issues.push({
        code: "INVALID_BUDGET",
        message: `budgets[${i}] monetaryBudget.value must be a non-negative number (advertiser currency major units)`,
        field: `data.budgets.${i}`,
      });
    }
  });
}

/**
 * Build one `DSP<Entity>Create` item from caller `data`. `adProduct` is set to
 * AMAZON_DSP on every type whose create schema carries it (all but
 * `DSPAdAssociationCreate`); campaigns and ad groups default to `state:
 * "PAUSED"` and refuse any other state.
 */
export function translateCreatePayload(
  entityType: AmazonDspCanonicalEntityType,
  data: Record<string, unknown>,
  accountId: string
): UnifiedPayload {
  const contract = getAmazonDspEntityContract(entityType);
  const item: Record<string, unknown> = { ...data };
  const issues: UnifiedPayloadIssue[] = [];

  applyLegacyMappings(entityType, item, accountId, issues, { renameParents: true });

  const carriesAdProduct = contract.createFields.includes("adProduct");
  if (carriesAdProduct) {
    if (item.adProduct !== undefined && item.adProduct !== AMAZON_DSP_AD_PRODUCT) {
      issues.push({
        code: "INVALID_AD_PRODUCT",
        message: `adProduct must be ${AMAZON_DSP_AD_PRODUCT} on this server — got ${String(item.adProduct)}`,
        field: "data.adProduct",
      });
    }
    item.adProduct = AMAZON_DSP_AD_PRODUCT;
  }

  if (contract.createStateMustBe) {
    if (item.state === undefined) {
      item.state = contract.createStateMustBe;
    } else if (item.state !== contract.createStateMustBe) {
      issues.push({
        code: "INVALID_STATE",
        message: `A DSP ${contract.displayName.toLowerCase()} can only be created ${contract.createStateMustBe} (DSPCreateState); update state to ENABLED after creating — got ${String(item.state)}`,
        field: "data.state",
      });
    }
  } else if (
    item.state !== undefined &&
    !(UNIFIED_CREATE_STATES as readonly unknown[]).includes(item.state)
  ) {
    issues.push({
      code: "INVALID_STATE",
      message: `state must be one of ${UNIFIED_CREATE_STATES.join(", ")} on create (DSPCreateState) — got ${String(item.state)}`,
      field: "data.state",
    });
  }

  if (contract.idField in item) {
    issues.push({
      code: "READ_ONLY_FIELD",
      message: `${contract.idField} is assigned by Amazon and cannot be sent on create`,
      field: `data.${contract.idField}`,
    });
  }

  checkBudgets(item, issues);
  return { item, issues };
}

/**
 * Build one `DSP<Entity>Update` item: the caller's patch plus the primary key.
 * `state` must be a `DSPUpdateState` (ENABLED | PAUSED) — ARCHIVED is not an
 * update state on the Unified DSP surface.
 */
export function translateUpdatePayload(
  entityType: AmazonDspCanonicalEntityType,
  entityId: string,
  data: Record<string, unknown>,
  accountId: string
): UnifiedPayload {
  const contract = getAmazonDspEntityContract(entityType);
  const item: Record<string, unknown> = { ...data };
  const issues: UnifiedPayloadIssue[] = [];

  applyLegacyMappings(entityType, item, accountId, issues, { renameParents: false });

  if ("state" in item && !(UNIFIED_UPDATE_STATES as readonly unknown[]).includes(item.state)) {
    issues.push({
      code: "INVALID_STATE",
      message:
        item.state === "ARCHIVED"
          ? "ARCHIVED is not an update state on the Unified DSP API (DSPUpdateState is ENABLED | PAUSED). Use amazon_dsp_delete_entity to remove an entity."
          : `state must be one of ${UNIFIED_UPDATE_STATES.join(", ")} (DSPUpdateState) — got ${String(item.state)}`,
      field: "data.state",
    });
  }

  if (contract.idField in item && String(item[contract.idField]) !== entityId) {
    issues.push({
      code: "CONFLICTING_FIELDS",
      message: `data.${contract.idField} (${String(item[contract.idField])}) differs from entityId (${entityId})`,
      field: `data.${contract.idField}`,
    });
  }
  // The primary key leads the item, as in the spec's DSP<Entity>Update.
  delete item[contract.idField];

  checkBudgets(item, issues);
  return { item: { [contract.idField]: entityId, ...item }, issues };
}

export interface UnifiedQueryParams {
  /** Caller `filters` (values may be comma-separated lists). */
  filters?: Record<string, string>;
  /** Select by primary key. */
  ids?: string[];
  maxResults?: number;
  nextToken?: string;
}

/**
 * Build a `DSPQuery<Entity>Request`. Every filter is `{ include: [...] }`;
 * `adProductFilter: { include: ["AMAZON_DSP"] }` is required on every query
 * request except `DSPQueryAdAssociationRequest`, which has none.
 */
export function buildQueryBody(
  entityType: AmazonDspCanonicalEntityType,
  params: UnifiedQueryParams,
  accountId: string
): UnifiedPayload {
  const { unified } = getAmazonDspEntityContract(entityType);
  const body: Record<string, unknown> = {};
  const issues: UnifiedPayloadIssue[] = [];

  if (unified.adProductFilter) {
    body.adProductFilter = { include: [AMAZON_DSP_AD_PRODUCT] };
  }

  const includes = new Map<string, string[]>();
  const add = (filter: string, values: string[]) => {
    const current = includes.get(filter) ?? [];
    for (const v of values) if (!current.includes(v)) current.push(v);
    includes.set(filter, current);
  };

  if (params.ids && params.ids.length > 0) {
    if (!unified.idFilter) {
      issues.push({
        code: "UNSUPPORTED_FILTER",
        message: `The Unified ${unified.resource} query has no ${unified.idField} filter`,
        field: "entityId",
      });
    } else {
      add(unified.idFilter, params.ids);
    }
  }

  for (const [key, raw] of Object.entries(params.filters ?? {})) {
    if (raw === undefined || raw === null) continue;
    const values = String(raw)
      .split(",")
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
    if (key === "advertiserId") {
      // Legacy list filter. The account is the Amazon-Ads-AccountId header.
      if (values.some((v) => v !== accountId)) {
        issues.push({
          code: "ACCOUNT_MISMATCH",
          message: `filters.advertiserId names a different account than accountId (${accountId}); the Unified API scopes every query by the Amazon-Ads-AccountId header`,
          field: "filters.advertiserId",
        });
      }
      continue;
    }
    const filter = unified.filterKeys[key];
    if (!filter) {
      issues.push({
        code: "UNSUPPORTED_FILTER",
        message: `filters.${key} is not a Unified ${unified.resource} query filter. Supported: ${Object.keys(unified.filterKeys).join(", ")}`,
        field: `filters.${key}`,
      });
      continue;
    }
    if (values.length > 0) add(filter, values);
  }

  for (const [filter, include] of includes) body[filter] = { include };
  if (params.maxResults !== undefined) {
    body.maxResults = Math.min(Math.max(1, params.maxResults), unified.maxResults);
  }
  if (params.nextToken !== undefined && params.nextToken !== "") {
    body.nextToken = params.nextToken;
  }
  return { item: body, issues };
}

/** Delete `path` (dotted; arrays traversed) from `obj` in place. */
function deletePath(obj: unknown, segments: string[]): void {
  if (Array.isArray(obj)) {
    for (const el of obj) deletePath(el, segments);
    return;
  }
  if (!isRecord(obj) || segments.length === 0) return;
  const [head, ...rest] = segments;
  if (rest.length === 0) {
    delete obj[head];
    return;
  }
  deletePath(obj[head], rest);
}

/**
 * Project a Unified read entity onto its create schema for a duplicate:
 * keep only the create schema's top-level keys, strip the nested read-only
 * paths (spec diff of `DSP<Entity>` vs `DSP<Entity>Create`), and drop campaign
 * `flights[].flightId` (the copy's flights are new — `flightId` is accepted on
 * create but names the SOURCE campaign's flight).
 */
export function projectForDuplicate(
  entityType: AmazonDspCanonicalEntityType,
  source: Record<string, unknown>
): Record<string, unknown> {
  const contract = getAmazonDspEntityContract(entityType);
  const copy = JSON.parse(JSON.stringify(source)) as Record<string, unknown>;
  const projected: Record<string, unknown> = {};
  for (const key of contract.createFields) {
    if (key in copy) projected[key] = copy[key];
  }
  for (const path of contract.readOnlyNestedPaths) deletePath(projected, path.split("."));
  if (entityType === "order") deletePath(projected, ["flights", "flightId"]);
  return projected;
}

/**
 * The create payload a duplicate sends: the source projected onto the create
 * schema, `state: "PAUSED"`, then `options`. Pure — shared by execute and the
 * dry-run. The result still goes through `translateCreatePayload`, so an
 * `options.state` other than PAUSED on a campaign / ad group is refused there.
 */
export function buildDuplicatePayload(
  entityType: AmazonDspCanonicalEntityType,
  source: Record<string, unknown>,
  options?: Record<string, unknown>
): Record<string, unknown> {
  return {
    ...projectForDuplicate(entityType, source),
    state: "PAUSED",
    ...(options ?? {}),
  };
}

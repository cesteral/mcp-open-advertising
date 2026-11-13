// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Snapshot capture helpers for DV360 `update_entity`. PR-D wiring.
 *
 * Extracted from `dry-run.ts` so the same read-and-normalize logic is reused
 * for:
 * - Symbolic dry-run (PR-C): read current entity, overlay updateMask fields,
 *   normalize.
 * - Real-write before/after (PR-D): read pre-state at handler start, execute
 *   the write, normalize the patched resource that DV360 returns.
 *
 * The canonical shape covers status, budget (an insertion order's segments, a
 * line item's fixed `maxAmount`; micros → ISO 4217 minor units of the
 * advertiser's currency), and basic flight schedule. Other DV360 entity types
 * (creatives, ad groups) fall outside round 1.
 */

import { buildSnapshotParents } from "@cesteral/shared";
import type {
  CanonicalEntityKind,
  CanonicalStatus,
  DryRunValidationError,
  NormalizedEntitySnapshot,
  RequestContext,
} from "@cesteral/shared";
import { currencyMinorUnitExponent, knownCurrencyOrNull } from "./iso-4217.js";

export interface Dv360ServiceLike {
  getEntity?: (
    entityType: string,
    ids: Record<string, string>,
    context?: RequestContext
  ) => Promise<unknown>;
  /** ISO 4217 currency of the advertiser (`DV360Service.getAdvertiserCurrency`). */
  getAdvertiserCurrency?: (advertiserId: string, context?: RequestContext) => Promise<string>;
}

/**
 * ISO 4217 "no currency involved" code, used when the advertiser's currency
 * cannot be read or is not a known ISO 4217 code, so a snapshot never claims a
 * currency it does not know. Governance reads a snapshot in it as an unknown
 * currency and refuses a non-zero exposure rather than defaulting one.
 */
export const DV360_UNKNOWN_CURRENCY = "XXX";

export const ENTITY_KIND_MAP: Record<string, CanonicalEntityKind> = {
  campaign: "campaign",
  insertionOrder: "insertion_order",
  lineItem: "line_item",
};

/**
 * The advertiser's currency for snapshots of `entityType`: every DV360 money
 * amount is micros of it, and neither the line item nor the insertion order
 * carries it. Degrades to DV360_UNKNOWN_CURRENCY when the service cannot
 * provide it, rather than failing the write or dry run the snapshot belongs
 * to. Reads nothing for a type with no canonical snapshot.
 */
export async function resolveDv360Currency(
  service: Dv360ServiceLike,
  entityType: string,
  ids: Record<string, string>,
  context?: RequestContext
): Promise<string> {
  const advertiserId = ids.advertiserId;
  if (!ENTITY_KIND_MAP[entityType] || !advertiserId || !service.getAdvertiserCurrency) {
    return DV360_UNKNOWN_CURRENCY;
  }
  try {
    const code = await service.getAdvertiserCurrency(advertiserId, context);
    return knownCurrencyOrNull(code) ?? DV360_UNKNOWN_CURRENCY;
  } catch {
    return DV360_UNKNOWN_CURRENCY;
  }
}

const STATUS_MAP: Record<string, CanonicalStatus> = {
  ENTITY_STATUS_ACTIVE: "active",
  ENTITY_STATUS_PAUSED: "paused",
  ENTITY_STATUS_ARCHIVED: "archived",
  ENTITY_STATUS_DELETED: "deleted",
  ENTITY_STATUS_DRAFT: "unknown",
  ENTITY_STATUS_SCHEDULED_FOR_DELETION: "deleted",
};

function normalizeStatus(raw: unknown): { canonical: CanonicalStatus; platformRaw: string } {
  const platformRaw = typeof raw === "string" ? raw : "";
  return { canonical: STATUS_MAP[platformRaw] ?? "unknown", platformRaw };
}

/**
 * The exponent for a currency that is unresolved (DV360_UNKNOWN_CURRENCY). An
 * amount in an unresolved currency is magnitude-only: the XXX label beside it
 * is what governance refuses on, so the exponent chosen here cannot size an
 * exposure. Governance converts such an amount at 2 for display, and so does
 * this.
 */
const UNRESOLVED_CURRENCY_EXPONENT = 2;

/**
 * Micros of the advertiser currency → its ISO 4217 minor units (the table in
 * `iso-4217.ts`, equal to the governance layer's). 1,000,000 micros is one
 * major unit: $1.00 = 100 cents, ¥1 = 1 minor unit (JPY has none smaller),
 * 1 KWD = 1,000 fils. Only a non-negative integer counts: an int64 arrives as
 * a digit string.
 */
function microsToMinor(micros: unknown, currency: string): number | undefined {
  if (typeof micros !== "string" && typeof micros !== "number") return undefined;
  const n = typeof micros === "string" ? (/^\d+$/.test(micros) ? Number(micros) : NaN) : micros;
  if (!Number.isFinite(n) || n < 0) return undefined;
  const exponent = currencyMinorUnitExponent(currency) ?? UNRESOLVED_CURRENCY_EXPONENT;
  const minor = Math.round(n / 10 ** (6 - exponent));
  return Number.isSafeInteger(minor) ? minor : undefined;
}

const FIXED_ALLOCATION = "LINE_ITEM_BUDGET_ALLOCATION_TYPE_FIXED";
type LineItemBudgetUnit = "BUDGET_UNIT_CURRENCY" | "BUDGET_UNIT_IMPRESSIONS";

function knownBudgetUnit(unit: unknown): LineItemBudgetUnit | undefined {
  return unit === "BUDGET_UNIT_CURRENCY" || unit === "BUDGET_UNIT_IMPRESSIONS" ? unit : undefined;
}

/**
 * A line item's budget unit, from AUTHORITATIVE state only. `LineItemBudget.
 * budgetUnit` is "Output only ... inherited from the parent insertion order"
 * (v4 Discovery): the platform sets it and ignores a caller's value, so a unit
 * in a payload says nothing about what the line item will have. It must never
 * decide how a budget is sized: a $50,000 fixed budget labelled
 * BUDGET_UNIT_IMPRESSIONS would otherwise read as a count of impressions and
 * book no exposure.
 *
 * `authoritativeBudget` is the budget of state read from the platform: the
 * current line item, or an API response. `appliedBudget` is the budget being
 * normalized; its unit counts only after {@link pinLineItemBudgetUnit} has
 * replaced a caller's value with the authoritative one, or removed it.
 * `undefined` when neither says: the unit, and so whether `maxAmount` is money
 * or a count of impressions, is not known.
 */
function resolveLineItemBudgetUnit(
  authoritativeBudget: Record<string, unknown> | undefined,
  appliedBudget: Record<string, unknown> | undefined
): LineItemBudgetUnit | undefined {
  return (
    knownBudgetUnit(authoritativeBudget?.budgetUnit) ?? knownBudgetUnit(appliedBudget?.budgetUnit)
  );
}

/** The budget unit the platform reports on `entity` (a line item read from DV360). */
export function lineItemBudgetUnitOf(
  entity: Record<string, unknown>
): LineItemBudgetUnit | undefined {
  return knownBudgetUnit((entity.budget as Record<string, unknown> | undefined)?.budgetUnit);
}

/**
 * Makes `applied` (a line item payload or overlay about to be snapshotted;
 * mutated in place, so pass a clone) carry the authoritative budget unit and
 * nothing else. A unit the caller supplied is replaced by `authoritative`, or
 * removed when there is none to replace it with, so it can never size or hide
 * a budget.
 *
 * Returns BUDGET_UNIT_CONFLICT when the caller's unit contradicts the
 * authoritative one: the call asked for something the platform will not do, so
 * the dry run must not pass. The preview then sizes the budget by the
 * authoritative unit, so the money stays visible.
 */
export function pinLineItemBudgetUnit(
  entityType: string,
  applied: Record<string, unknown>,
  authoritative: LineItemBudgetUnit | undefined
): DryRunValidationError | undefined {
  const budget = applied.budget;
  if (entityType !== "lineItem" || !budget || typeof budget !== "object") return undefined;
  const target = budget as Record<string, unknown>;
  const supplied = knownBudgetUnit(target.budgetUnit);
  if (authoritative) {
    target.budgetUnit = authoritative;
  } else {
    delete target.budgetUnit;
  }
  if (supplied && authoritative && supplied !== authoritative) {
    return {
      code: "BUDGET_UNIT_CONFLICT",
      message:
        `The payload's budget.budgetUnit is ${supplied}, but the line item's budget unit is ` +
        `${authoritative}. The unit is output-only: it is inherited from the parent insertion ` +
        `order and cannot be set. The preview is sized by ${authoritative}.`,
      field: "budget.budgetUnit",
    };
  }
  return undefined;
}

/**
 * The dry-run error for a line item whose budget has a fixed amount but no
 * authoritative unit. The snapshot cannot say whether `maxAmount` is money, and
 * a lifetime of null is read downstream as "books no exposure". An explicit
 * failure is the only way to say "unknown, not zero" through the canonical
 * shape, so the dry run does not pass. `undefined` when the unit is known or
 * there is no fixed amount to size. Call after {@link pinLineItemBudgetUnit}.
 */
export function lineItemBudgetUnitUndetermined(
  entityType: string,
  current: Record<string, unknown>,
  applied: Record<string, unknown>
): DryRunValidationError | undefined {
  if (entityType !== "lineItem") return undefined;
  const budget = applied.budget as Record<string, unknown> | undefined;
  if (budget?.budgetAllocationType !== FIXED_ALLOCATION || budget.maxAmount == null) {
    return undefined;
  }
  const currentBudget = current.budget as Record<string, unknown> | undefined;
  if (resolveLineItemBudgetUnit(currentBudget, budget)) return undefined;
  return {
    code: "BUDGET_UNIT_UNDETERMINED",
    message:
      "The line item's budget unit (currency or impressions) is output-only and could not be " +
      "determined from the current line item or the parent insertion order, so the size of " +
      "its budget is unknown.",
    field: "budget.budgetUnit",
  };
}

/**
 * The budget unit a line item about to be created inherits: its parent
 * insertion order's (`data.insertionOrderId`), read from the platform. Read
 * whenever the budget has a fixed amount to size, whatever unit the payload
 * claims; a read failure propagates, like an unreadable pre-state does for an
 * update dry run. `undefined` when there is no parent to read or it has no
 * unit.
 */
export async function readParentBudgetUnit(
  service: Dv360ServiceLike,
  entityType: string,
  ids: Record<string, string>,
  data: Record<string, unknown>,
  context?: RequestContext
): Promise<LineItemBudgetUnit | undefined> {
  const budget = data.budget as Record<string, unknown> | undefined;
  const advertiserId = ids.advertiserId ?? data.advertiserId;
  const insertionOrderId = data.insertionOrderId;
  if (
    entityType !== "lineItem" ||
    budget?.budgetAllocationType !== FIXED_ALLOCATION ||
    budget.maxAmount == null ||
    typeof advertiserId !== "string" ||
    typeof insertionOrderId !== "string" ||
    !service.getEntity
  ) {
    return undefined;
  }
  const parent = (await service.getEntity(
    "insertionOrder",
    { advertiserId, insertionOrderId },
    context
  )) as Record<string, any> | undefined;
  return knownBudgetUnit(parent?.budget?.budgetUnit);
}

/**
 * A line item's lifetime budget: a FIXED allocation in currency carries its
 * cap in `budget.maxAmount`, micros of the advertiser's currency (v4 Discovery
 * `LineItemBudget.maxAmount`). Everything else has no fixed currency amount, so
 * the lifetime stays null rather than reading as 0:
 * - UNLIMITED: "this field is not applicable and will be ignored by the system",
 *   so a stale value may still be echoed back;
 * - AUTOMATIC: "immutable and is set by the system", not a cap anyone fixed;
 * - BUDGET_UNIT_IMPRESSIONS: `maxAmount` is a number of impressions;
 * - no determinable unit: see {@link lineItemBudgetUnitUndetermined}.
 */
function lineItemLifetime(
  budget: Record<string, unknown> | undefined,
  unit: LineItemBudgetUnit | undefined,
  currency: string
): { amountMinor: number; currency: string } | null {
  if (budget?.budgetAllocationType !== FIXED_ALLOCATION || unit !== "BUDGET_UNIT_CURRENCY") {
    return null;
  }
  const amountMinor = microsToMinor(budget.maxAmount, currency);
  return amountMinor == null ? null : { amountMinor, currency };
}

/**
 * Pure builder. `applied` is the entity post-overlay (or post-write); `current`
 * is the entity it replaces, used for the status when `applied.entityStatus` is
 * missing and, being platform state, as the authority for a line item's budget
 * unit (which a caller's `applied.budget` does not get to decide).
 * `currency` is the advertiser's ISO 4217 code (`resolveDv360Currency`): DV360
 * amounts are micros of it, which the entity itself does not carry. A code that
 * is not a known ISO 4217 currency is reported as DV360_UNKNOWN_CURRENCY.
 */
export function buildDv360Snapshot(
  entityType: string,
  ids: Record<string, string>,
  current: Record<string, unknown>,
  applied: Record<string, unknown>,
  currencyCode: string
): NormalizedEntitySnapshot | null {
  const entityKind = ENTITY_KIND_MAP[entityType];
  if (!entityKind) return null;
  const currency = knownCurrencyOrNull(currencyCode) ?? DV360_UNKNOWN_CURRENCY;

  const platformEntityId =
    ids.lineItemId ?? ids.insertionOrderId ?? ids.campaignId ?? ids.advertiserId ?? "";

  const merged = applied as Record<string, any>;

  const segments: Array<{
    amountMinor: number;
    currency: string;
    startAt: string | null;
    endAt: string | null;
  }> = [];
  const segArr = merged?.budget?.budgetSegments;
  if (Array.isArray(segArr)) {
    for (const seg of segArr) {
      const amountMinor = microsToMinor(seg?.budgetAmountMicros, currency);
      if (amountMinor == null) continue;
      const start = seg?.dateRange?.startDate;
      const end = seg?.dateRange?.endDate;
      const startAt = start
        ? `${start.year}-${String(start.month).padStart(2, "0")}-${String(start.day).padStart(2, "0")}`
        : null;
      const endAt = end
        ? `${end.year}-${String(end.month).padStart(2, "0")}-${String(end.day).padStart(2, "0")}`
        : null;
      segments.push({ amountMinor, currency, startAt, endAt });
    }
  }
  const lifetimeMinor = segments.reduce((sum, s) => sum + s.amountMinor, 0);

  const flightStart = merged?.flight?.dateRange?.startDate;
  const flightEnd = merged?.flight?.dateRange?.endDate;

  // The ancestors the entity's own `campaignId` / `insertionOrderId` fields
  // name (the overlay first, so a create payload counts; the current read-back
  // otherwise). A line item sits under an insertion order under a campaign; an
  // insertion order sits under a campaign; a campaign's only ancestor is the
  // advertiser, which is `accountId`.
  const ancestor = (field: "campaignId" | "insertionOrderId"): unknown =>
    merged?.[field] ?? (current as Record<string, unknown>)?.[field];
  const parents =
    entityKind === "line_item"
      ? buildSnapshotParents([
          { kind: "campaign", id: ancestor("campaignId") },
          { kind: "insertion_order", id: ancestor("insertionOrderId") },
        ])
      : entityKind === "insertion_order"
        ? buildSnapshotParents([{ kind: "campaign", id: ancestor("campaignId") }])
        : undefined;

  return {
    schemaVersion: 1,
    platform: "dv360",
    entityKind,
    platformEntityId,
    displayName: typeof merged.displayName === "string" ? merged.displayName : null,
    accountId: typeof ids.advertiserId === "string" ? ids.advertiserId : null,
    status: normalizeStatus(merged.entityStatus ?? (current as any).entityStatus),
    budget: {
      daily: null,
      lifetime:
        entityKind === "line_item"
          ? lineItemLifetime(
              merged?.budget,
              resolveLineItemBudgetUnit(
                current.budget as Record<string, unknown> | undefined,
                merged?.budget
              ),
              currency
            )
          : lifetimeMinor > 0
            ? { amountMinor: lifetimeMinor, currency }
            : null,
      segments: segments.length > 0 ? segments : null,
    },
    schedule: {
      startAt: flightStart
        ? `${flightStart.year}-${String(flightStart.month).padStart(2, "0")}-${String(flightStart.day).padStart(2, "0")}`
        : null,
      endAt: flightEnd
        ? `${flightEnd.year}-${String(flightEnd.month).padStart(2, "0")}-${String(flightEnd.day).padStart(2, "0")}`
        : null,
    },
    ...(parents ? { parents } : {}),
  };
}

/**
 * Read the entity through the service-layer abstraction and normalize.
 * Returns `undefined` if the entity type is not in the canonical scope or
 * the read fails.
 */
export async function captureDv360Snapshot(
  dv360Service: Dv360ServiceLike,
  entityType: string,
  ids: Record<string, string>,
  context: RequestContext,
  /** The currency the caller already resolved, so the two snapshots of one write cannot differ. */
  resolvedCurrency?: string
): Promise<NormalizedEntitySnapshot | undefined> {
  if (!ENTITY_KIND_MAP[entityType] || !dv360Service.getEntity) return undefined;
  try {
    const current = (await dv360Service.getEntity(entityType, ids, context)) as Record<
      string,
      unknown
    >;
    if (!current || typeof current !== "object") return undefined;
    const currency =
      resolvedCurrency ?? (await resolveDv360Currency(dv360Service, entityType, ids, context));
    const snapshot = buildDv360Snapshot(entityType, ids, current, current, currency);
    return snapshot ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Normalize an entity object that's already in hand (e.g. the patched resource
 * returned by the DV360 PATCH call). No I/O.
 *
 * Returns undefined when the object lacks every field the canonical snapshot
 * would surface (status, displayName, budget). DV360 PATCH normally returns
 * the patched resource in full, but if the SDK shape is unexpected (e.g. an
 * empty `{}` or a wrapped envelope), callers should fall back to a re-read
 * rather than emit a snapshot with `status: unknown` derived from absent data.
 * `currency` is the advertiser's (`resolveDv360Currency`).
 */
export function snapshotFromDv360Entity(
  entityType: string,
  ids: Record<string, string>,
  entity: Record<string, unknown>,
  currency: string
): NormalizedEntitySnapshot | undefined {
  if (!ENTITY_KIND_MAP[entityType]) return undefined;
  if (
    !entity ||
    (entity.entityStatus == null && entity.displayName == null && entity.budget == null)
  ) {
    return undefined;
  }
  const snapshot = buildDv360Snapshot(entityType, ids, entity, entity, currency);
  return snapshot ?? undefined;
}

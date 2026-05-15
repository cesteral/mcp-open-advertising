// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Dry-run helpers for the Meta `update_entity` tool. PR-C wiring.
 *
 * Meta's Graph API does not expose a generic "validate-only" mutation
 * endpoint that we can invoke without side effects, and the `meta_validate_entity`
 * tool in this package is itself client-side schema validation only. So both
 * axes here are SYMBOLIC for round 1:
 *
 * - **Validation** runs the input Zod schema plus a small set of business
 *   rules against the requested mutation. `validationSource: "symbolic"`.
 * - **Expected post-state** is produced by reading the current entity through
 *   the existing `metaService.getEntity` path and applying the requested
 *   field changes in memory. We only normalize the canonical shape for the
 *   handful of fields PR-C and round-1 govern (status, daily_budget,
 *   lifetime_budget, name). Anything else returns `expectedStateSource: "none"`.
 */

import type {
  DryRunResult,
  DryRunValidationError,
  NormalizedEntitySnapshot,
  CanonicalEntityKind,
  CanonicalStatus,
  RequestContext,
} from "@cesteral/shared";

interface MetaServiceLike {
  // Loosened from `MetaService.getEntity` (which is typed against the
  // `MetaEntityType` union) so we can accept arbitrary `entityType` strings
  // here without leaking the platform-specific union into the dry-run helper.
  getEntity?: (
    entityType: any,
    entityId: string,
    fields?: string[] | undefined,
    context?: RequestContext
  ) => Promise<unknown>;
}

const STATUS_MAP: Record<string, CanonicalStatus> = {
  ACTIVE: "active",
  PAUSED: "paused",
  ARCHIVED: "archived",
  DELETED: "deleted",
};

const ENTITY_KIND_MAP: Record<string, CanonicalEntityKind> = {
  campaign: "campaign",
  adSet: "ad_set",
  ad: "ad",
};

function normalizeStatus(raw: unknown): { canonical: CanonicalStatus; platformRaw: string } {
  const platformRaw = typeof raw === "string" ? raw : "";
  return { canonical: STATUS_MAP[platformRaw] ?? "unknown", platformRaw };
}

function toMoney(amount: unknown, currency: string): { amountMinor: number; currency: string } | undefined {
  if (amount == null) return undefined;
  const n = typeof amount === "string" ? Number.parseInt(amount, 10) : Number(amount);
  if (!Number.isFinite(n)) return undefined;
  return { amountMinor: n, currency };
}

function buildSnapshot(
  entityType: string,
  entityId: string,
  current: Record<string, unknown>,
  patch: Record<string, unknown>
): NormalizedEntitySnapshot | null {
  const entityKind = ENTITY_KIND_MAP[entityType];
  if (!entityKind) return null;

  const merged: Record<string, unknown> = { ...current, ...patch };
  const currency =
    (typeof current.currency === "string" && current.currency) ||
    (typeof current.account_currency === "string" && current.account_currency) ||
    "USD";

  const daily = toMoney(merged.daily_budget, currency);
  const lifetime = toMoney(merged.lifetime_budget, currency);

  return {
    schemaVersion: 1,
    platform: "meta_ads",
    entityKind,
    platformEntityId: entityId,
    displayName: typeof merged.name === "string" ? merged.name : null,
    accountId:
      typeof current.account_id === "string"
        ? current.account_id
        : typeof current.adAccountId === "string"
          ? current.adAccountId
          : null,
    status: normalizeStatus(merged.status ?? current.status),
    budget: {
      daily: daily ?? null,
      lifetime: lifetime ?? null,
    },
    schedule: {
      startAt: typeof merged.start_time === "string" ? merged.start_time : null,
      endAt: typeof merged.end_time === "string" ? merged.end_time : null,
    },
  };
}

function symbolicValidate(data: Record<string, unknown>): DryRunValidationError[] {
  const errors: DryRunValidationError[] = [];
  if ("status" in data) {
    const status = data.status;
    if (typeof status !== "string" || !["ACTIVE", "PAUSED", "ARCHIVED", "DELETED"].includes(status)) {
      errors.push({
        code: "INVALID_STATUS",
        message: `status must be one of ACTIVE, PAUSED, ARCHIVED, DELETED — got ${String(status)}`,
        field: "data.status",
      });
    }
  }
  for (const k of ["daily_budget", "lifetime_budget"] as const) {
    if (k in data) {
      const v = data[k];
      const n = typeof v === "string" ? Number.parseInt(v, 10) : Number(v);
      if (!Number.isFinite(n) || n < 0) {
        errors.push({
          code: "INVALID_BUDGET",
          message: `${k} must be a non-negative integer (cents)`,
          field: `data.${k}`,
        });
      }
    }
  }
  return errors;
}

export interface MetaDryRunArgs {
  entityType: string | undefined;
  entityId: string;
  data: Record<string, unknown>;
}

export async function runMetaUpdateDryRun(
  input: MetaDryRunArgs,
  metaService: MetaServiceLike,
  context: RequestContext
): Promise<DryRunResult> {
  const validationErrors = symbolicValidate(input.data);

  let expectedPostState: NormalizedEntitySnapshot | undefined;
  let expectedStateSource: DryRunResult["expectedStateSource"] = "none";

  if (input.entityType && ENTITY_KIND_MAP[input.entityType] && metaService.getEntity) {
    try {
      const current = (await metaService.getEntity(
        input.entityType,
        input.entityId,
        undefined,
        context
      )) as Record<string, unknown> | undefined;
      if (current && typeof current === "object") {
        const snapshot = buildSnapshot(input.entityType, input.entityId, current, input.data);
        if (snapshot) {
          expectedPostState = snapshot;
          expectedStateSource = "server_symbolic_apply";
        }
      }
    } catch {
      // Symbolic apply is best-effort; if the read fails we leave
      // expectedStateSource: "none". Validation result is still meaningful.
    }
  }

  return {
    wouldSucceed: validationErrors.length === 0,
    validationErrors,
    validationSource: "symbolic",
    expectedStateSource,
    ...(expectedPostState ? { expectedPostState } : {}),
  };
}

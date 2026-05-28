// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Dry-run + snapshot helpers for the governed `amazon_dsp_update_commitment`
 * write tool. Parallel to `dry-run.ts` + `capture-snapshot.ts` (which handle
 * `amazon_dsp_update_entity`) but scoped to the v1 commitment surface.
 *
 * Amazon's v1 commitment update endpoint, like the rest of the DSP write
 * surface, exposes no native validate / preview / draft mode — both axes are
 * SYMBOLIC:
 *
 * - **Validation** runs business rules against the requested patch
 *   (`validationSource: "symbolic"`).
 * - **Expected post-state** reads the current commitment through the read
 *   partner and shallow-merges the patch (the Amazon update endpoint replaces
 *   provided fields), then normalises.
 *   (`expectedStateSource: "server_symbolic_apply"`.)
 */

import { assertGovernedDryRunResult } from "@cesteral/shared";
import type {
  DispatchedCapability,
  DryRunResult,
  DryRunValidationError,
  NormalizedEntitySnapshot,
  RequestContext,
} from "@cesteral/shared";
import type {
  DSPCommitmentT,
  DSPCommitmentUpdateT,
} from "../../../services/amazon-dsp/v1-schemas.js";

/**
 * Loose service surface accepted by these helpers — tests mock with a minimal
 * `getCommitment` only. Mirrors `AmazonDspServiceLike` in capture-snapshot.ts.
 */
export interface AmazonDspV1ServiceLike {
  getCommitment?: (commitmentId: string, context?: RequestContext) => Promise<DSPCommitmentT>;
}

const FULFILLMENT_LEVELS = ["LEVEL_0", "LEVEL_5"];
const SPEND_CALCULATION_MODES = ["ADVERTISER_ACCOUNT", "CAMPAIGN", "MANAGER_ACCOUNT"];

/**
 * Symbolic validation of the requested commitment patch. Pure (no I/O).
 *
 * Covers the rules that are cheap to express and that the API would
 * 400-reject anyway. Date ordering is only enforced when both endpoints are
 * present in the patch; mismatch between patch end and existing start is left
 * to the API since we do not have current state at validation time.
 */
function symbolicValidate(data: Partial<DSPCommitmentUpdateT>): DryRunValidationError[] {
  const errors: DryRunValidationError[] = [];

  if ("committedSpend" in data && data.committedSpend !== undefined) {
    const n = Number(data.committedSpend);
    if (!Number.isFinite(n) || n < 0) {
      errors.push({
        code: "INVALID_COMMITTED_SPEND",
        message: "committedSpend must be a non-negative number (advertiser currency major units)",
        field: "data.committedSpend",
      });
    }
  }

  if ("fulfillmentLevel" in data && data.fulfillmentLevel !== undefined) {
    if (!FULFILLMENT_LEVELS.includes(data.fulfillmentLevel as string)) {
      errors.push({
        code: "INVALID_FULFILLMENT_LEVEL",
        message: `fulfillmentLevel must be one of ${FULFILLMENT_LEVELS.join(", ")} — got ${String(data.fulfillmentLevel)}`,
        field: "data.fulfillmentLevel",
      });
    }
  }

  if ("spendCalculationMode" in data && data.spendCalculationMode !== undefined) {
    if (!SPEND_CALCULATION_MODES.includes(data.spendCalculationMode as string)) {
      errors.push({
        code: "INVALID_SPEND_CALCULATION_MODE",
        message: `spendCalculationMode must be one of ${SPEND_CALCULATION_MODES.join(", ")} — got ${String(data.spendCalculationMode)}`,
        field: "data.spendCalculationMode",
      });
    }
  }

  if (
    "startDateTime" in data &&
    "endDateTime" in data &&
    typeof data.startDateTime === "string" &&
    typeof data.endDateTime === "string"
  ) {
    const start = Date.parse(data.startDateTime);
    const end = Date.parse(data.endDateTime);
    if (Number.isFinite(start) && Number.isFinite(end) && end <= start) {
      errors.push({
        code: "INVALID_SCHEDULE",
        message: "endDateTime must be strictly after startDateTime",
        field: "data.endDateTime",
      });
    }
  }

  return errors;
}

function toMinor(amount: unknown): number | undefined {
  if (amount == null) return undefined;
  const n = typeof amount === "string" ? Number(amount) : Number(amount);
  if (!Number.isFinite(n)) return undefined;
  return Math.round(n * 100);
}

/**
 * Build the canonical pre/post snapshot from current state + an optional patch.
 * Used by both dry-run (patch = requested mutation) and real-write `after`
 * capture (patch = {} or the entity Amazon returns post-update).
 *
 * The Amazon update endpoint replaces provided fields, so the patch is a
 * shallow overlay — same semantics as the existing entity-update helper.
 */
export function buildCommitmentSnapshot(
  commitmentId: string,
  profileId: string,
  current: Partial<DSPCommitmentT>,
  patch: Partial<DSPCommitmentUpdateT>
): NormalizedEntitySnapshot {
  const merged = { ...current, ...patch } as Partial<DSPCommitmentT>;

  const currency = typeof merged.currencyCode === "string" ? merged.currencyCode : "USD";
  const amountMinor = toMinor(merged.committedSpend);
  const lifetime = amountMinor != null ? { amountMinor, currency } : null;

  return {
    schemaVersion: 1,
    platform: "amazon_dsp",
    entityKind: "commitment",
    platformEntityId: commitmentId,
    displayName: typeof merged.commitmentName === "string" ? merged.commitmentName : null,
    // Commitments are scoped to a DSP profile (the tenant), not an advertiser.
    accountId: profileId,
    // Commitments have no `state` field in the spec — they are live until
    // their endDateTime. The canonical snapshot keeps the surface stable.
    status: { canonical: "active", platformRaw: "ACTIVE" },
    budget: {
      daily: null,
      lifetime,
    },
    schedule: {
      startAt: typeof merged.startDateTime === "string" ? merged.startDateTime : null,
      endAt: typeof merged.endDateTime === "string" ? merged.endDateTime : null,
    },
  };
}

/**
 * Symbolic-apply entry point for testkit fixtures. Thin wrapper over
 * `buildCommitmentSnapshot`, parallel in shape to `applyAmazonDspPatch` in
 * `dry-run.ts`. Re-exported from `@cesteral/amazon-dsp-mcp/testkit`.
 *
 * Pure: no I/O, no upstream calls. Used by `assertContract` when
 * `fixture.entityKind === "commitment"`.
 */
export function applyCommitmentPatch(
  commitmentId: string,
  profileId: string,
  preState: Partial<DSPCommitmentT>,
  data: Partial<DSPCommitmentUpdateT>
): NormalizedEntitySnapshot {
  return buildCommitmentSnapshot(commitmentId, profileId, preState, data);
}

/**
 * Read the commitment through the service layer and normalise. Returns
 * `undefined` if the read fails — callers leave `before` / `after`
 * undefined rather than throwing.
 */
export async function captureCommitmentSnapshot(
  service: AmazonDspV1ServiceLike,
  commitmentId: string,
  profileId: string,
  context: RequestContext
): Promise<NormalizedEntitySnapshot | undefined> {
  if (!service.getCommitment) return undefined;
  try {
    const current = await service.getCommitment(commitmentId, context);
    if (!current || typeof current !== "object") return undefined;
    return buildCommitmentSnapshot(commitmentId, profileId, current, {});
  } catch {
    return undefined;
  }
}

/** Normalise a commitment object already in hand. No I/O. */
export function snapshotFromCommitment(
  commitmentId: string,
  profileId: string,
  entity: Partial<DSPCommitmentT>
): NormalizedEntitySnapshot | undefined {
  if (!entity || typeof entity !== "object") return undefined;
  return buildCommitmentSnapshot(commitmentId, profileId, entity, {});
}

/**
 * Resolve the concrete `(operation, entityKind)` an `amazon_dsp_update_commitment`
 * call dispatches to. Single-operation tool — always `update`. Returned
 * inline on every governed response (dry-run and real write alike).
 */
export function resolveCommitmentDispatchedCapability(): DispatchedCapability {
  return {
    operation: "update",
    canonicalEntityKind: "commitment",
  };
}

export interface CommitmentUpdateDryRunArgs {
  commitmentId: string;
  profileId: string;
  data: Partial<DSPCommitmentUpdateT>;
}

export async function runCommitmentUpdateDryRun(
  input: CommitmentUpdateDryRunArgs,
  service: AmazonDspV1ServiceLike,
  context: RequestContext
): Promise<DryRunResult> {
  const validationErrors = symbolicValidate(input.data);

  let expectedPostState: NormalizedEntitySnapshot | undefined;
  let expectedStateSource: DryRunResult["expectedStateSource"] = "none";

  // A read failure propagates — the dry-run cannot simulate without current
  // state. assertGovernedDryRunResult below would reject expectedStateSource:
  // "none" anyway, so we keep the error visible.
  if (service.getCommitment) {
    const current = await service.getCommitment(input.commitmentId, context);
    if (current && typeof current === "object") {
      expectedPostState = buildCommitmentSnapshot(
        input.commitmentId,
        input.profileId,
        current,
        input.data
      );
      expectedStateSource = "server_symbolic_apply";
    }
  }

  return assertGovernedDryRunResult(
    {
      wouldSucceed: validationErrors.length === 0,
      validationErrors,
      validationSource: "symbolic",
      expectedStateSource,
      ...(expectedPostState ? { expectedPostState } : {}),
    },
    "amazon_dsp_update_commitment"
  );
}

// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Dry-run helpers for the Amazon DSP entity write tools. R2-U4 wiring,
 * Unified API (`/adsApi/v1/*`) since #234.
 *
 * The Unified DSP spec (unified-api-dsp.json, amzn/ads-advanced-tools-docs @
 * e25aace0) declares no validate-only / preview mode on any create, update or
 * delete operation, so both axes here are SYMBOLIC:
 *
 * - **Validation** runs the same request-body translation the execute path
 *   runs (`translateCreatePayload` / `translateUpdatePayload`: legacy-field
 *   mapping, `DSPCreateState` / `DSPUpdateState` checks, account match, budget
 *   non-negativity). `validationSource: "symbolic"`.
 * - **Expected post-state** reads the current entity through the read partner
 *   (Unified `query/*`) and shallow-merges the translated patch, then
 *   normalizes. `expectedStateSource: "server_symbolic_apply"`.
 */

import { assertGovernedDryRunResult } from "@cesteral/shared";
import type {
  DispatchedCapability,
  DryRunResult,
  DryRunValidationError,
  NormalizedEntitySnapshot,
  RequestContext,
} from "@cesteral/shared";
import {
  buildAmazonDspSnapshot,
  ENTITY_KIND_MAP,
  type AmazonDspServiceLike,
} from "./capture-snapshot.js";
import {
  buildDuplicatePayload,
  translateCreatePayload,
  translateUpdatePayload,
  type UnifiedPayloadIssue,
} from "../../../services/amazon-dsp/unified-payload.js";
import {
  getAmazonDspEntityContract,
  normalizeAmazonDspEntityType,
} from "../../../services/amazon-dsp/amazon-dsp-api-contract.js";

export type { AmazonDspServiceLike };

function toValidationErrors(issues: UnifiedPayloadIssue[]): DryRunValidationError[] {
  return issues.map((i) => ({ code: i.code, message: i.message, field: i.field }));
}

/**
 * Symbolic validation of an update patch — the execute path's translation,
 * reporting its issues instead of throwing. Pure (no I/O).
 */
export function symbolicValidateUpdate(
  entityType: string,
  entityId: string,
  data: Record<string, unknown>,
  accountId: string
): DryRunValidationError[] {
  const t = normalizeAmazonDspEntityType(entityType);
  return toValidationErrors(translateUpdatePayload(t, entityId, data, accountId).issues);
}

/** Symbolic validation of a create payload. Pure (no I/O). */
export function symbolicValidateCreate(
  entityType: string,
  data: Record<string, unknown>,
  accountId: string
): DryRunValidationError[] {
  const t = normalizeAmazonDspEntityType(entityType);
  return toValidationErrors(translateCreatePayload(t, data, accountId).issues);
}

/**
 * Symbolic apply: shallow-merge `data` (Unified shape) into `preState`, then
 * normalize. Pure (no I/O). Used by the testkit's `assertContract` against
 * fixture pairs and mirrors what the dry-run handler does in-tool.
 */
export function applyAmazonDspPatch(
  entityType: string,
  entityId: string,
  preState: Record<string, unknown>,
  data: Record<string, unknown>,
  accountId: string | null = null
): NormalizedEntitySnapshot | undefined {
  const snapshot = buildAmazonDspSnapshot(entityType, entityId, preState, data, accountId);
  return snapshot ?? undefined;
}

/**
 * Resolve the concrete `(operation, entityKind)` an `amazon_dsp_update_entity`
 * call dispatches to, from its `data` payload. The tool is a multi-operation
 * dispatcher; governance requires every response to name the capability the
 * call exercised. Pure (no I/O).
 */
export function resolveAmazonDspDispatchedCapability(
  entityType: string,
  data: Record<string, unknown>
): DispatchedCapability {
  const state = typeof data.state === "string" ? data.state : undefined;
  let operation: string;
  if (state === "ENABLED") {
    operation = "resume";
  } else if (state === "PAUSED") {
    operation = "pause";
  } else if (state) {
    // Any other state value (refused by validation — DSPUpdateState is ENABLED | PAUSED).
    operation = "update_status";
  } else if ("budgets" in data || "budget" in data) {
    operation = "update_budget";
  } else {
    operation = "update";
  }
  return {
    operation,
    canonicalEntityKind: ENTITY_KIND_MAP[entityType] || entityType || "unknown",
  };
}

/**
 * Resolve the `(create, entityKind)` capability for `amazon_dsp_create_entity`.
 * Out-of-scope kinds (creative / target / creativeAssociation) resolve to
 * `canonicalEntityKind: null` — the call is still token-gated but emits no
 * snapshot. Pure (no I/O).
 */
export function resolveAmazonDspCreateCapability(entityType: string): DispatchedCapability {
  return {
    operation: "create",
    canonicalEntityKind: ENTITY_KIND_MAP[entityType] ?? null,
  };
}

export interface AmazonDspCreateDryRunArgs {
  entityType: string;
  accountId: string;
  data: Record<string, unknown>;
}

/**
 * Symbolic create dry-run: validation is the create translation; the expected
 * post-state is the would-be-created entity (the translated create item over
 * an empty base — create has no `before`). Pure (no I/O).
 */
export async function runAmazonDspCreateDryRun(
  input: AmazonDspCreateDryRunArgs,
  _service: AmazonDspServiceLike,
  _context: RequestContext
): Promise<DryRunResult> {
  const t = normalizeAmazonDspEntityType(input.entityType);
  const { item, issues } = translateCreatePayload(t, input.data, input.accountId);
  const validationErrors = toValidationErrors(issues);

  let expectedPostState: NormalizedEntitySnapshot | undefined;
  let expectedStateSource: DryRunResult["expectedStateSource"] = "none";
  if (ENTITY_KIND_MAP[input.entityType]) {
    const snapshot = buildAmazonDspSnapshot(input.entityType, "", {}, item, input.accountId);
    if (snapshot) {
      expectedPostState = snapshot;
      expectedStateSource = "server_symbolic_apply";
    }
  }

  // Out-of-scope kinds are token-gated but NOT snapshot-governed (plan
  // §Template A): they legitimately resolve canonicalEntityKind: null and emit
  // no canonical snapshot — on dry-run as well as execute. The in-scope
  // simulation guard (`assertGovernedDryRunResult`) must therefore be skipped
  // for them; applying it would fail an honest no-snapshot result.
  const inScope = Boolean(ENTITY_KIND_MAP[input.entityType]);
  const result: DryRunResult = {
    wouldSucceed: validationErrors.length === 0 && (!inScope || expectedPostState !== undefined),
    validationErrors,
    validationSource: "symbolic",
    expectedStateSource,
    ...(expectedPostState ? { expectedPostState } : {}),
  };
  return inScope ? assertGovernedDryRunResult(result, "amazon_dsp_create_entity") : result;
}

export interface AmazonDspDryRunArgs {
  entityType: string;
  accountId: string;
  entityId: string;
  data: Record<string, unknown>;
}

export async function runAmazonDspUpdateDryRun(
  input: AmazonDspDryRunArgs,
  service: AmazonDspServiceLike,
  context: RequestContext
): Promise<DryRunResult> {
  const t = normalizeAmazonDspEntityType(input.entityType);
  const { item, issues } = translateUpdatePayload(t, input.entityId, input.data, input.accountId);
  const validationErrors = toValidationErrors(issues);
  // The translated item leads with the primary key; the snapshot overlay is the patch only.
  const patch = { ...item };
  delete patch[getAmazonDspEntityContract(t).idField];

  let expectedPostState: NormalizedEntitySnapshot | undefined;
  let expectedStateSource: DryRunResult["expectedStateSource"] = "none";

  // A read failure propagates: a governed dry-run that cannot simulate must
  // fail the call (see assertGovernedDryRunResult below), not swallow the
  // error and return an incomplete payload the governance layer would reject.
  if (ENTITY_KIND_MAP[input.entityType] && service.getEntity) {
    const current = (await service.getEntity(
      input.entityType,
      input.accountId,
      input.entityId,
      context
    )) as Record<string, unknown> | undefined;
    if (current && typeof current === "object") {
      const snapshot = buildAmazonDspSnapshot(
        input.entityType,
        input.entityId,
        current,
        patch,
        input.accountId
      );
      if (snapshot) {
        expectedPostState = snapshot;
        expectedStateSource = "server_symbolic_apply";
      }
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
    "amazon_dsp_update_entity"
  );
}

/**
 * Resolve the `(duplicate, entityKind)` for an `amazon_dsp_duplicate_entity`
 * call. Out-of-scope types (creative / creativeAssociation) resolve to
 * `canonicalEntityKind: null` — token-gated, no canonical snapshot. Pure.
 */
export function resolveAmazonDspDuplicateCapability(entityType: string): DispatchedCapability {
  return {
    operation: "duplicate",
    canonicalEntityKind: ENTITY_KIND_MAP[entityType] ?? null,
  };
}

export interface AmazonDspDuplicateDryRunArgs {
  entityType: string;
  accountId: string;
  /** ID of the SOURCE entity being duplicated. */
  entityId: string;
  /** Copy overrides forwarded to the create call (may rename the copy). */
  options?: Record<string, unknown>;
}

/**
 * Symbolic dry-run for `amazon_dsp_duplicate_entity`. The copy does not exist
 * yet (no `before`). Execute builds the copy as the source projected onto the
 * create schema, `state: "PAUSED"`, then `options` (`buildDuplicatePayload`),
 * and sends it through the create translation — so the dry-run reads the
 * source, builds the same payload, validates it with the same translation and
 * emits it with an empty `platformEntityId`. Out-of-scope kinds are
 * token-gated but not snapshot-governed.
 */
export async function runAmazonDspDuplicateDryRun(
  args: AmazonDspDuplicateDryRunArgs,
  service: AmazonDspServiceLike,
  context: RequestContext
): Promise<DryRunResult> {
  let validationErrors: DryRunValidationError[] = [];
  let expectedPostState: NormalizedEntitySnapshot | undefined;
  let expectedStateSource: DryRunResult["expectedStateSource"] = "none";

  const inScope = Boolean(ENTITY_KIND_MAP[args.entityType]);
  if (inScope && service.getEntity) {
    const source = (await service.getEntity(
      args.entityType,
      args.accountId,
      args.entityId,
      context
    )) as Record<string, unknown> | undefined;
    if (source && typeof source === "object") {
      const t = normalizeAmazonDspEntityType(args.entityType);
      const copy = buildDuplicatePayload(t, source, args.options);
      const { item, issues } = translateCreatePayload(t, copy, args.accountId);
      validationErrors = toValidationErrors(issues);
      const snapshot = buildAmazonDspSnapshot(args.entityType, "", {}, item, args.accountId);
      if (snapshot) {
        expectedPostState = snapshot;
        expectedStateSource = "server_symbolic_apply";
      }
    }
  }

  // Out-of-scope kinds are token-gated but NOT snapshot-governed (plan
  // §Template A): skip the in-scope simulation guard for them.
  const result: DryRunResult = {
    wouldSucceed: validationErrors.length === 0 && (!inScope || expectedPostState !== undefined),
    validationErrors,
    validationSource: "symbolic",
    expectedStateSource,
    ...(expectedPostState ? { expectedPostState } : {}),
  };
  return inScope ? assertGovernedDryRunResult(result, "amazon_dsp_duplicate_entity") : result;
}

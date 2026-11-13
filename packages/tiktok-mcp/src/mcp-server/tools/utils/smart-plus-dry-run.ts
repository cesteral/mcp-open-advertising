// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Symbolic validation and dry-run for the Upgraded Smart+ write tools.
 *
 * TikTok has no validate / preview mode for `/smart_plus/*` writes, so both
 * axes are symbolic, as for the legacy tools: business rules on the payload,
 * and an expected post-state built from the read-partner snapshot overlaid
 * with the patch.
 */

import { assertGovernedDryRunResult } from "@cesteral/shared";
import type {
  DispatchedCapability,
  DryRunResult,
  DryRunValidationError,
  NormalizedEntitySnapshot,
  RequestContext,
} from "@cesteral/shared";
import { ENTITY_KIND_MAP } from "./capture-snapshot.js";
import { SMART_PLUS_CUTOFF_OBJECTIVES, type SmartPlusEntityType } from "./smart-plus-mapping.js";
import {
  buildSmartPlusSnapshot,
  captureSmartPlusEntity,
  type SmartPlusServiceLike,
} from "./smart-plus-snapshot.js";

const CREATE_OPERATION_STATUS = ["ENABLE", "DISABLE"];
const CAMPAIGN_BUDGET_MODES = [
  "BUDGET_MODE_DYNAMIC_DAILY_BUDGET",
  "BUDGET_MODE_TOTAL",
  "BUDGET_MODE_INFINITE",
  "BUDGET_MODE_DAY",
];

function missing(data: Record<string, unknown>, field: string): boolean {
  const v = data[field];
  return v === undefined || v === null || v === "";
}

function budgetErrors(data: Record<string, unknown>): DryRunValidationError[] {
  if (!("budget" in data) || data.budget == null) return [];
  const n = Number(data.budget);
  if (!Number.isFinite(n) || n < 0) {
    return [
      {
        code: "INVALID_BUDGET",
        message: "budget must be a non-negative number (advertiser currency major units)",
        field: "data.budget",
      },
    ];
  }
  return [];
}

/**
 * Required-field checks for an Upgraded Smart+ create. Pure.
 *
 * basis: TikTok's create pages (business-api.tiktok.com/portal/docs/
 * create-an-upgraded-smart-{campaign,ad-group,ad}/v1.3, read 2026-11-13) and the
 * official SDK's `yml_files/smart_plus_{campaign,adgroup,ad}_create.yml`.
 * `request_id` is not checked: the service makes one when the caller gives none.
 */
export function smartPlusCreateErrors(
  entityType: SmartPlusEntityType,
  data: Record<string, unknown>
): DryRunValidationError[] {
  const errors: DryRunValidationError[] = [];
  const need = (field: string, why?: string) => {
    if (missing(data, field)) {
      errors.push({
        code: "MISSING_REQUIRED_FIELD",
        message: `${field} is required by TikTok's Upgraded Smart+ ${entityType} create${why ? ` (${why})` : ""}`,
        field: `data.${field}`,
      });
    }
  };

  if (entityType === "campaign") {
    need("campaign_name");
    need("objective_type");
    const objective = data.objective_type;
    if (!missing(data, "objective_type")) {
      if (!(SMART_PLUS_CUTOFF_OBJECTIVES as readonly string[]).includes(String(objective))) {
        errors.push({
          code: "UNSUPPORTED_OBJECTIVE",
          message: `objective_type must be one of ${SMART_PLUS_CUTOFF_OBJECTIVES.join(", ")} — got ${String(objective)}. Other objectives (for example TRAFFIC) are not offered by the Upgraded Smart+ API; use tiktok_create_entity.`,
          field: "data.objective_type",
        });
      } else if (objective === "APP_PROMOTION") {
        need("app_promotion_type", "required when objective_type is APP_PROMOTION");
      } else if (objective === "WEB_CONVERSIONS") {
        need("sales_destination", "required when objective_type is WEB_CONVERSIONS");
      }
    }
    if (
      data.budget_mode !== undefined &&
      !CAMPAIGN_BUDGET_MODES.includes(String(data.budget_mode))
    ) {
      errors.push({
        code: "INVALID_BUDGET_MODE",
        message: `budget_mode must be one of ${CAMPAIGN_BUDGET_MODES.join(", ")} — got ${String(data.budget_mode)}`,
        field: "data.budget_mode",
      });
    }
  } else if (entityType === "adGroup") {
    for (const f of [
      "campaign_id",
      "adgroup_name",
      "promotion_type",
      "optimization_goal",
      "bid_type",
      "billing_event",
      "targeting_spec",
      "schedule_type",
      "schedule_start_time",
    ]) {
      need(f);
    }
  } else {
    need("adgroup_id");
  }

  if (
    data.operation_status !== undefined &&
    !CREATE_OPERATION_STATUS.includes(String(data.operation_status))
  ) {
    errors.push({
      code: "INVALID_OPERATION_STATUS",
      message: `operation_status on create must be one of ${CREATE_OPERATION_STATUS.join(", ")} — got ${String(data.operation_status)}`,
      field: "data.operation_status",
    });
  }

  return [...errors, ...budgetErrors(data)];
}

/**
 * Checks for an Upgraded Smart+ update. Pure.
 *
 * A status change goes to `status/update/`, a separate request
 * (`tiktok_update_smart_plus_status`); the update bodies carry no
 * `operation_status`.
 */
export function smartPlusUpdateErrors(data: Record<string, unknown>): DryRunValidationError[] {
  const errors: DryRunValidationError[] = [];
  if ("operation_status" in data) {
    errors.push({
      code: "STATUS_VIA_STATUS_TOOL",
      message:
        "operation_status is not an update field: TikTok changes status through {entity}/status/update/. Use tiktok_update_smart_plus_status.",
      field: "data.operation_status",
    });
  }
  return [...errors, ...budgetErrors(data)];
}

export function resolveSmartPlusCreateCapability(entityType: string): DispatchedCapability {
  return { operation: "create", canonicalEntityKind: ENTITY_KIND_MAP[entityType] ?? null };
}

export function resolveSmartPlusUpdateCapability(
  entityType: string,
  data: Record<string, unknown>
): DispatchedCapability {
  return {
    operation: "budget" in data ? "update_budget" : "update",
    canonicalEntityKind: ENTITY_KIND_MAP[entityType] || entityType || "unknown",
  };
}

export async function runSmartPlusCreateDryRun(
  args: { entityType: SmartPlusEntityType; data: Record<string, unknown> },
  toolName: string
): Promise<DryRunResult> {
  const validationErrors = smartPlusCreateErrors(args.entityType, args.data);
  const snapshot = buildSmartPlusSnapshot(args.entityType, "", {}, args.data);
  return assertGovernedDryRunResult(
    {
      wouldSucceed: validationErrors.length === 0 && snapshot !== null,
      validationErrors,
      validationSource: "symbolic",
      expectedStateSource: snapshot ? "server_symbolic_apply" : "none",
      ...(snapshot ? { expectedPostState: snapshot } : {}),
    },
    toolName
  );
}

export async function runSmartPlusUpdateDryRun(
  args: { entityType: SmartPlusEntityType; entityId: string; data: Record<string, unknown> },
  service: SmartPlusServiceLike,
  context: RequestContext,
  toolName: string
): Promise<DryRunResult> {
  const validationErrors = smartPlusUpdateErrors(args.data);
  let expectedPostState: NormalizedEntitySnapshot | undefined;

  // A read failure propagates: a governed dry run that cannot simulate must
  // fail the call rather than return a payload governance would reject.
  if (service.getSmartPlusEntity) {
    const current = (await service.getSmartPlusEntity(args.entityType, args.entityId, context)) as
      | Record<string, unknown>
      | undefined;
    if (current && typeof current === "object") {
      expectedPostState =
        buildSmartPlusSnapshot(args.entityType, args.entityId, current, args.data) ?? undefined;
    }
  }

  return assertGovernedDryRunResult(
    {
      wouldSucceed: validationErrors.length === 0,
      validationErrors,
      validationSource: "symbolic",
      expectedStateSource: expectedPostState ? "server_symbolic_apply" : "none",
      ...(expectedPostState ? { expectedPostState } : {}),
    },
    toolName
  );
}

export { captureSmartPlusEntity };

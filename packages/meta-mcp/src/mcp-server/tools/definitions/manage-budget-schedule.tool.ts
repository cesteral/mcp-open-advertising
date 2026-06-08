// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
  elicitBudgetChangeConfirmation,
  assertGovernedEffectDryRun,
  EffectResultSchema,
  EffectDryRunResultSchema,
  DispatchedCapabilitySchema,
} from "@cesteral/shared";
import type {
  RequestContext,
  McpTextContent,
  SdkContext,
  DispatchedCapability,
  CesteralWriteToolAnnotations,
} from "@cesteral/shared";

const TOOL_NAME = "meta_manage_budget_schedule";
const TOOL_TITLE = "Meta Ads Budget Schedule Management";
const TOOL_DESCRIPTION = `Create or list budget schedules for a campaign.

Budget schedules allow temporary budget increases during high-demand periods
(e.g., flash sales, holidays). Uses POST /{campaignId}/budget_schedules.

**Operations:**
- \`create\` — Create a new budget schedule on a campaign
- \`list\` — List existing budget schedules for a campaign

**Create requires:**
- \`budget_value\` (string) — Budget amount in cents (e.g., "5000" for $50)
- \`budget_value_type\` (string) — ABSOLUTE or RELATIVE
- \`time_start\` (string) — ISO 8601 start time
- \`time_end\` (string) — ISO 8601 end time`;

export const ManageBudgetScheduleInputSchema = z
  .object({
    operation: z.enum(["create", "list"]).describe("Operation to perform"),
    campaignId: z.string().min(1).describe("Campaign ID to manage budget schedules for"),
    data: z
      .record(z.any())
      .optional()
      .describe(
        "Budget schedule data (required for create: budget_value, budget_value_type, time_start, time_end)"
      ),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the request and returns an EffectDryRunResult under `dryRun` without prompting for confirmation or calling the Meta API. No budget schedule is created."
      ),
  })
  .superRefine((val, ctx) => {
    if (val.operation === "create" && !val.data) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["data"],
        message: "data is required when operation is 'create'",
      });
    }
  })
  .describe("Parameters for managing Meta campaign budget schedules");

export const ManageBudgetScheduleOutputSchema = z
  .object({
    confirmed: z.boolean(),
    declineReason: z.string().optional(),
    operation: z.string(),
    campaignId: z.string(),
    result: z.record(z.any()).describe("API response data"),
    timestamp: z.string().datetime(),
    dryRun: EffectDryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. No budget schedule was created."
    ),
    effect: EffectResultSchema.optional().describe(
      "Effect-class result identity (effectKind `budget_schedule_managed` + scalar audit summary). Present on a confirmed execute."
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "The concrete (operation, entityKind) this call resolved to — `manage` with `canonicalEntityKind: null` (effect class; a budget schedule is not a canonical entity). Present on every response."
    ),
  })
  .describe("Budget schedule operation result");

type ManageBudgetScheduleInput = z.infer<typeof ManageBudgetScheduleInputSchema>;
type ManageBudgetScheduleOutput = z.infer<typeof ManageBudgetScheduleOutputSchema>;

export async function manageBudgetScheduleLogic(
  input: ManageBudgetScheduleInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<ManageBudgetScheduleOutput> {
  // Effect-class write: a budget schedule is not a canonical entity.
  const dispatchedCapability: DispatchedCapability = {
    operation: "manage",
    canonicalEntityKind: null,
  };

  if (input.dry_run === true) {
    return {
      confirmed: true,
      operation: input.operation,
      campaignId: input.campaignId,
      result: {},
      timestamp: new Date().toISOString(),
      dryRun: assertGovernedEffectDryRun(
        {
          wouldSucceed: true,
          validationErrors: [],
          validationSource: "symbolic",
          expectedEffectSource: "symbolic",
          expectedEffect: {
            effectKind: "budget_schedule_managed",
            summary: { operation: input.operation, campaign_id: input.campaignId },
          },
        },
        TOOL_NAME,
        { requiresValidation: true, requiresSimulation: true }
      ),
      dispatchedCapability,
    };
  }

  if (input.operation === "create") {
    const data = input.data ?? {};
    const budget = data.budget_value ?? "(unspecified)";
    const valueType = data.budget_value_type ?? "ABSOLUTE";
    const start = data.time_start ?? "";
    const end = data.time_end ?? "";
    const confirmed = await elicitBudgetChangeConfirmation({
      entityLabel: "campaign",
      entityId: input.campaignId,
      summary: `Creating budget schedule: ${valueType} budget=${budget} cents from ${start} to ${end}.`,
      sdkContext,
    });
    if (!confirmed) {
      return {
        confirmed: false,
        declineReason: "user_declined",
        operation: input.operation,
        campaignId: input.campaignId,
        result: {},
        timestamp: new Date().toISOString(),
        dispatchedCapability,
      };
    }
  }

  const { metaService } = resolveSessionServices(sdkContext);

  let result: unknown;

  if (input.operation === "create") {
    result = await metaService.createBudgetSchedule(input.campaignId, input.data!, context);
  } else {
    result = await metaService.listBudgetSchedules(input.campaignId, context);
  }

  return {
    confirmed: true,
    operation: input.operation,
    campaignId: input.campaignId,
    result: result as Record<string, unknown>,
    timestamp: new Date().toISOString(),
    // Effect summary carries audit identity only — never the raw budget data.
    effect: {
      effectKind: "budget_schedule_managed",
      summary: { operation: input.operation, campaign_id: input.campaignId },
    },
    dispatchedCapability,
  };
}

export function manageBudgetScheduleResponseFormatter(
  result: ManageBudgetScheduleOutput
): McpTextContent[] {
  if (result.dryRun) {
    const { wouldSucceed, validationSource, expectedEffectSource } = result.dryRun;
    return [
      {
        type: "text" as const,
        text: `Dry run: budget schedule ${result.operation} on campaign ${result.campaignId} ${wouldSucceed ? "would succeed" : "would FAIL"} (validation: ${validationSource}, expected-effect: ${expectedEffectSource}). No budget schedule was created.\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  if (!result.confirmed) {
    return [
      {
        type: "text" as const,
        text: `Budget schedule creation cancelled by user.\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  const header =
    result.operation === "create"
      ? `Budget schedule created for campaign ${result.campaignId}`
      : `Budget schedules for campaign ${result.campaignId}`;

  return [
    {
      type: "text" as const,
      text: `${header}\n\n${JSON.stringify(result.result, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const manageBudgetScheduleTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: ManageBudgetScheduleInputSchema,
  outputSchema: ManageBudgetScheduleOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: true,
    idempotentHint: false,
    destructiveHint: false,
    cesteral: {
      kind: "write",
      writeClass: "effect",
      executableArgsExclude: ["dry_run"],
      platform: "meta_ads",
      contractPlatformSlug: "meta",
      contractToolSlug: "manage_budget_schedule",
      operation: ["manage"],
      entityKinds: [],
      entityIdArgs: ["campaignId"],
      schemaVersion: 1,
      contractId: "meta.manage_budget_schedule.v1",
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Create a budget schedule for a flash sale",
      input: {
        operation: "create",
        campaignId: "23456789012345",
        data: {
          budget_value: "10000",
          budget_value_type: "ABSOLUTE",
          time_start: "2026-04-01T00:00:00-0700",
          time_end: "2026-04-02T00:00:00-0700",
        },
      },
    },
    {
      label: "List budget schedules for a campaign",
      input: {
        operation: "list",
        campaignId: "23456789012345",
      },
    },
  ],
  logic: manageBudgetScheduleLogic,
  responseFormatter: manageBudgetScheduleResponseFormatter,
};

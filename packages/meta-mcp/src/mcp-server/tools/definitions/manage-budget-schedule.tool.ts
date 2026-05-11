// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { elicitBudgetChangeConfirmation } from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

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
  })
  .describe("Budget schedule operation result");

type ManageBudgetScheduleInput = z.infer<typeof ManageBudgetScheduleInputSchema>;
type ManageBudgetScheduleOutput = z.infer<typeof ManageBudgetScheduleOutputSchema>;

export async function manageBudgetScheduleLogic(
  input: ManageBudgetScheduleInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<ManageBudgetScheduleOutput> {
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
  };
}

export function manageBudgetScheduleResponseFormatter(
  result: ManageBudgetScheduleOutput
): McpTextContent[] {
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

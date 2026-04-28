// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
  CampaignUpdateWorkflowInputSchema,
  CampaignsUpdateJobInputSchema,
  toWorkflowCallbackInput,
} from "../utils/workflow-schemas.js";
import type { McpTextContent, RequestContext, SdkContext } from "@cesteral/shared";

const TOOL_NAME = "ttd_update_campaigns";
const TOOL_TITLE = "TTD Update Campaigns";
const TOOL_DESCRIPTION = `Update one or more campaigns through the TTD Workflows API (PATCH semantics).

- \`mode: "single"\` — synchronous PATCH of a single campaign by id.
- \`mode: "batch"\` — submit an async Workflows job that updates multiple campaigns. Returns a JobId; poll status with \`ttd_get_job_status\`.`;

export const UpdateCampaignsToolInputSchema = z
  .discriminatedUnion("mode", [
    CampaignUpdateWorkflowInputSchema.extend({
      mode: z
        .literal("single")
        .describe("Synchronous single-campaign PATCH via Workflows API"),
    }),
    CampaignsUpdateJobInputSchema.extend({
      mode: z.literal("batch").describe("Async bulk-update job via Workflows API"),
    }),
  ])
  .describe("Parameters for updating campaigns via the TTD Workflows API");

export const UpdateCampaignsToolOutputSchema = z.object({
  mode: z.enum(["single", "batch"]),
  campaign: z
    .record(z.unknown())
    .optional()
    .describe("Campaign workflow response (mode=single)"),
  job: z.record(z.unknown()).optional().describe("Job submission response (mode=batch)"),
  timestamp: z.string().datetime(),
});

type UpdateCampaignsToolInput = z.infer<typeof UpdateCampaignsToolInputSchema>;
type UpdateCampaignsToolOutput = z.infer<typeof UpdateCampaignsToolOutputSchema>;

export async function updateCampaignsLogic(
  input: UpdateCampaignsToolInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<UpdateCampaignsToolOutput> {
  const { ttdService } = resolveSessionServices(sdkContext);
  const timestamp = new Date().toISOString();

  if (input.mode === "single") {
    const { mode: _mode, ...payload } = input;
    const campaign = (await ttdService.updateCampaignWorkflow(payload, context)) as Record<
      string,
      unknown
    >;
    return { mode: "single", campaign, timestamp };
  }

  const job = (await ttdService.updateCampaignsJob(
    {
      input: input.input,
      ...(input.validateInputOnly !== undefined
        ? { validateInputOnly: input.validateInputOnly }
        : {}),
      ...(input.callbackInput
        ? { callbackInput: toWorkflowCallbackInput(input.callbackInput) }
        : {}),
    },
    context
  )) as Record<string, unknown>;
  return { mode: "batch", job, timestamp };
}

export function updateCampaignsResponseFormatter(
  result: UpdateCampaignsToolOutput
): McpTextContent[] {
  const body =
    result.mode === "single"
      ? `Campaign workflow update response:\n\n${JSON.stringify(result.campaign, null, 2)}`
      : `Campaigns update job submitted:\n\n${JSON.stringify(result.job, null, 2)}`;
  return [{ type: "text" as const, text: `${body}\n\nTimestamp: ${result.timestamp}` }];
}

export const updateCampaignsTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: UpdateCampaignsToolInputSchema,
  outputSchema: UpdateCampaignsToolOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    destructiveHint: true,
    idempotentHint: false,
  },
  inputExamples: [
    {
      label: "Update a single campaign (workflow)",
      input: {
        mode: "single",
        id: "camp123",
        primaryInput: {
          name: "Updated Workflow Campaign",
        },
      },
    },
    {
      label: "Submit batch campaign-update job",
      input: {
        mode: "batch",
        input: [
          {
            id: "camp123",
            primaryInput: {
              name: "Updated Campaign One",
            },
          },
        ],
      },
    },
  ],
  logic: updateCampaignsLogic,
  responseFormatter: updateCampaignsResponseFormatter,
};

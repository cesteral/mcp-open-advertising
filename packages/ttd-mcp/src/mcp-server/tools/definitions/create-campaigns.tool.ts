// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
  CampaignCreateWorkflowInputSchema,
  CampaignsJobInputSchema,
  toWorkflowCallbackInput,
} from "../utils/workflow-schemas.js";
import type { McpTextContent, RequestContext, SdkContext } from "@cesteral/shared";

const TOOL_NAME = "ttd_create_campaigns";
const TOOL_TITLE = "TTD Create Campaigns";
const TOOL_DESCRIPTION = `Create one or more campaigns through the TTD Workflows API.

- \`mode: "single"\` — synchronous create of a single campaign with workflow-aware payload (advanced settings, optional ad group creation, validate-only mode).
- \`mode: "batch"\` — submit an async Workflows job that creates multiple campaigns. Returns a JobId; poll status with \`ttd_get_job_status\`.`;

export const CreateCampaignsToolInputSchema = z
  .discriminatedUnion("mode", [
    CampaignCreateWorkflowInputSchema.extend({
      mode: z
        .literal("single")
        .describe("Synchronous single-campaign create via Workflows API"),
    }),
    CampaignsJobInputSchema.extend({
      mode: z.literal("batch").describe("Async bulk-create job via Workflows API"),
    }),
  ])
  .describe("Parameters for creating campaigns via the TTD Workflows API");

export const CreateCampaignsToolOutputSchema = z.object({
  mode: z.enum(["single", "batch"]),
  campaign: z
    .record(z.unknown())
    .optional()
    .describe("Campaign workflow response (mode=single)"),
  job: z.record(z.unknown()).optional().describe("Job submission response (mode=batch)"),
  timestamp: z.string().datetime(),
});

type CreateCampaignsToolInput = z.infer<typeof CreateCampaignsToolInputSchema>;
type CreateCampaignsToolOutput = z.infer<typeof CreateCampaignsToolOutputSchema>;

export async function createCampaignsLogic(
  input: CreateCampaignsToolInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<CreateCampaignsToolOutput> {
  const { ttdService } = resolveSessionServices(sdkContext);
  const timestamp = new Date().toISOString();

  if (input.mode === "single") {
    const { mode: _mode, ...payload } = input;
    const campaign = (await ttdService.createCampaignWorkflow(payload, context)) as Record<
      string,
      unknown
    >;
    return { mode: "single", campaign, timestamp };
  }

  const job = (await ttdService.createCampaignsJob(
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

export function createCampaignsResponseFormatter(
  result: CreateCampaignsToolOutput
): McpTextContent[] {
  const body =
    result.mode === "single"
      ? `Campaign workflow response:\n\n${JSON.stringify(result.campaign, null, 2)}`
      : `Campaigns job submitted:\n\n${JSON.stringify(result.job, null, 2)}`;
  return [{ type: "text" as const, text: `${body}\n\nTimestamp: ${result.timestamp}` }];
}

export const createCampaignsTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: CreateCampaignsToolInputSchema,
  outputSchema: CreateCampaignsToolOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    destructiveHint: true,
    idempotentHint: false,
  },
  inputExamples: [
    {
      label: "Create a single campaign (workflow)",
      input: {
        mode: "single",
        primaryInput: {
          advertiserId: "adv123",
          name: "Workflow Campaign",
          seedId: "seed123",
          primaryChannel: "DISPLAY",
        },
      },
    },
    {
      label: "Submit batch campaign-create job",
      input: {
        mode: "batch",
        input: [
          {
            primaryInput: {
              advertiserId: "adv123",
              name: "Campaign One",
            },
          },
        ],
      },
    },
  ],
  logic: createCampaignsLogic,
  responseFormatter: createCampaignsResponseFormatter,
};

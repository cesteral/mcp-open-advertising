// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { CampaignCreateWorkflowInputSchema } from "../utils/workflow-schemas.js";
import type { McpTextContent, RequestContext, SdkContext } from "@cesteral/shared";

const TOOL_NAME = "ttd_create_campaign_workflow";
const TOOL_TITLE = "TTD Create Campaign Workflow";
const TOOL_DESCRIPTION = `Create a campaign through the TTD Workflows API using workflow-aware payloads.

Supports nested workflow fields like advanced settings, optional ad group creation, and validate-only mode.`;

export const CreateCampaignWorkflowToolInputSchema = CampaignCreateWorkflowInputSchema.describe(
  "Parameters for creating a campaign via the TTD Workflows API"
);

export const CreateCampaignWorkflowToolOutputSchema = z.object({
  campaign: z.record(z.unknown()).describe("Raw campaign workflow response"),
  timestamp: z.string().datetime(),
});

type CreateCampaignWorkflowToolInput = z.infer<typeof CreateCampaignWorkflowToolInputSchema>;
type CreateCampaignWorkflowToolOutput = z.infer<typeof CreateCampaignWorkflowToolOutputSchema>;

export async function createCampaignWorkflowLogic(
  input: CreateCampaignWorkflowToolInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<CreateCampaignWorkflowToolOutput> {
  const { ttdService } = resolveSessionServices(sdkContext);
  const campaign = (await ttdService.createCampaignWorkflow(input, context)) as Record<string, unknown>;
  return { campaign, timestamp: new Date().toISOString() };
}

export function createCampaignWorkflowResponseFormatter(
  result: CreateCampaignWorkflowToolOutput
): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Campaign workflow response:\n\n${JSON.stringify(result.campaign, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const createCampaignWorkflowTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: CreateCampaignWorkflowToolInputSchema,
  outputSchema: CreateCampaignWorkflowToolOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    destructiveHint: true,
    idempotentHint: false,
  },
  inputExamples: [
    {
      label: "Create campaign workflow",
      input: {
        primaryInput: {
          advertiserId: "adv123",
          name: "Workflow Campaign",
          seedId: "seed123",
          primaryChannel: "DISPLAY",
        },
      },
    },
  ],
  logic: createCampaignWorkflowLogic,
  responseFormatter: createCampaignWorkflowResponseFormatter,
};

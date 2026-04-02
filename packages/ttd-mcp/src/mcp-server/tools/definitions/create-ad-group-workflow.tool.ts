// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { AdGroupCreateWorkflowInputSchema } from "../utils/workflow-schemas.js";
import type { McpTextContent, RequestContext, SdkContext } from "@cesteral/shared";

const TOOL_NAME = "ttd_create_ad_group_workflow";
const TOOL_TITLE = "TTD Create Ad Group Workflow";
const TOOL_DESCRIPTION = `Create an ad group through the TTD Workflows API using workflow-aware payloads.`;

export const CreateAdGroupWorkflowToolInputSchema = AdGroupCreateWorkflowInputSchema.describe(
  "Parameters for creating an ad group via the TTD Workflows API"
);

export const CreateAdGroupWorkflowToolOutputSchema = z.object({
  adGroup: z.record(z.unknown()).describe("Raw ad group workflow response"),
  timestamp: z.string().datetime(),
});

type CreateAdGroupWorkflowToolInput = z.infer<typeof CreateAdGroupWorkflowToolInputSchema>;
type CreateAdGroupWorkflowToolOutput = z.infer<typeof CreateAdGroupWorkflowToolOutputSchema>;

export async function createAdGroupWorkflowLogic(
  input: CreateAdGroupWorkflowToolInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<CreateAdGroupWorkflowToolOutput> {
  const { ttdService } = resolveSessionServices(sdkContext);
  const adGroup = (await ttdService.createAdGroupWorkflow(input, context)) as Record<string, unknown>;
  return { adGroup, timestamp: new Date().toISOString() };
}

export function createAdGroupWorkflowResponseFormatter(
  result: CreateAdGroupWorkflowToolOutput
): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Ad group workflow response:\n\n${JSON.stringify(result.adGroup, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const createAdGroupWorkflowTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: CreateAdGroupWorkflowToolInputSchema,
  outputSchema: CreateAdGroupWorkflowToolOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    destructiveHint: true,
    idempotentHint: false,
  },
  inputExamples: [
    {
      label: "Create ad group workflow",
      input: {
        campaignId: "camp123",
        primaryInput: {
          name: "Workflow Ad Group",
          channel: "DISPLAY",
        },
      },
    },
  ],
  logic: createAdGroupWorkflowLogic,
  responseFormatter: createAdGroupWorkflowResponseFormatter,
};

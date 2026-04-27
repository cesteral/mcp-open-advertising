// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { AdGroupUpdateWorkflowInputSchema } from "../utils/workflow-schemas.js";
import type { McpTextContent, RequestContext, SdkContext } from "@cesteral/shared";

const TOOL_NAME = "ttd_update_ad_group_workflow";
const TOOL_TITLE = "TTD Update Ad Group Workflow";
const TOOL_DESCRIPTION = `Update an ad group through the TTD Workflows API using PATCH semantics.`;

export const UpdateAdGroupWorkflowToolInputSchema = AdGroupUpdateWorkflowInputSchema.describe(
  "Parameters for updating an ad group via the TTD Workflows API"
);

export const UpdateAdGroupWorkflowToolOutputSchema = z.object({
  adGroup: z.record(z.unknown()).describe("Raw ad group workflow response"),
  timestamp: z.string().datetime(),
});

type UpdateAdGroupWorkflowToolInput = z.infer<typeof UpdateAdGroupWorkflowToolInputSchema>;
type UpdateAdGroupWorkflowToolOutput = z.infer<typeof UpdateAdGroupWorkflowToolOutputSchema>;

export async function updateAdGroupWorkflowLogic(
  input: UpdateAdGroupWorkflowToolInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<UpdateAdGroupWorkflowToolOutput> {
  const { ttdService } = resolveSessionServices(sdkContext);
  const adGroup = (await ttdService.updateAdGroupWorkflow(input, context)) as Record<
    string,
    unknown
  >;
  return { adGroup, timestamp: new Date().toISOString() };
}

export function updateAdGroupWorkflowResponseFormatter(
  result: UpdateAdGroupWorkflowToolOutput
): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Ad group workflow update response:\n\n${JSON.stringify(result.adGroup, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const updateAdGroupWorkflowTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: UpdateAdGroupWorkflowToolInputSchema,
  outputSchema: UpdateAdGroupWorkflowToolOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    destructiveHint: true,
    idempotentHint: false,
  },
  inputExamples: [
    {
      label: "Update ad group workflow",
      input: {
        id: "ag123",
        primaryInput: {
          name: "Updated Workflow Ad Group",
        },
      },
    },
  ],
  logic: updateAdGroupWorkflowLogic,
  responseFormatter: updateAdGroupWorkflowResponseFormatter,
};

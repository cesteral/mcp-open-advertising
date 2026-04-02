// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
  AdGroupsUpdateJobInputSchema,
  toWorkflowCallbackInput,
} from "../utils/workflow-schemas.js";
import type { McpTextContent, RequestContext, SdkContext } from "@cesteral/shared";

const TOOL_NAME = "ttd_update_ad_groups_job";
const TOOL_TITLE = "TTD Update Ad Groups Job";
const TOOL_DESCRIPTION = `Submit an async Workflows job to update multiple ad groups.`;

export const UpdateAdGroupsJobToolInputSchema = AdGroupsUpdateJobInputSchema.describe(
  "Parameters for submitting an ad group bulk-update job"
);

export const UpdateAdGroupsJobToolOutputSchema = z.object({
  job: z.record(z.unknown()).describe("Raw ad group job submission response"),
  timestamp: z.string().datetime(),
});

type UpdateAdGroupsJobToolInput = z.infer<typeof UpdateAdGroupsJobToolInputSchema>;
type UpdateAdGroupsJobToolOutput = z.infer<typeof UpdateAdGroupsJobToolOutputSchema>;

export async function updateAdGroupsJobLogic(
  input: UpdateAdGroupsJobToolInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<UpdateAdGroupsJobToolOutput> {
  const { ttdService } = resolveSessionServices(sdkContext);
  const job = (await ttdService.updateAdGroupsJob({
    input: input.input,
    ...(input.validateInputOnly !== undefined ? { validateInputOnly: input.validateInputOnly } : {}),
    ...(input.callbackInput ? { callbackInput: toWorkflowCallbackInput(input.callbackInput) } : {}),
  }, context)) as Record<string, unknown>;
  return { job, timestamp: new Date().toISOString() };
}

export function updateAdGroupsJobResponseFormatter(
  result: UpdateAdGroupsJobToolOutput
): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Ad groups update job submitted:\n\n${JSON.stringify(result.job, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const updateAdGroupsJobTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: UpdateAdGroupsJobToolInputSchema,
  outputSchema: UpdateAdGroupsJobToolOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    destructiveHint: true,
    idempotentHint: false,
  },
  inputExamples: [
    {
      label: "Submit ad groups update job",
      input: {
        input: [
          {
            id: "ag123",
            primaryInput: {
              name: "Updated Ad Group One",
            },
          },
        ],
      },
    },
  ],
  logic: updateAdGroupsJobLogic,
  responseFormatter: updateAdGroupsJobResponseFormatter,
};

// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
  AdGroupsJobInputSchema,
  toWorkflowCallbackInput,
} from "../utils/workflow-schemas.js";
import type { McpTextContent, RequestContext, SdkContext } from "@cesteral/shared";

const TOOL_NAME = "ttd_create_ad_groups_job";
const TOOL_TITLE = "TTD Create Ad Groups Job";
const TOOL_DESCRIPTION = `Submit an async Workflows job to create multiple ad groups.`;

export const CreateAdGroupsJobToolInputSchema = AdGroupsJobInputSchema.describe(
  "Parameters for submitting an ad group bulk-create job"
);

export const CreateAdGroupsJobToolOutputSchema = z.object({
  job: z.record(z.unknown()).describe("Raw ad group job submission response"),
  timestamp: z.string().datetime(),
});

type CreateAdGroupsJobToolInput = z.infer<typeof CreateAdGroupsJobToolInputSchema>;
type CreateAdGroupsJobToolOutput = z.infer<typeof CreateAdGroupsJobToolOutputSchema>;

export async function createAdGroupsJobLogic(
  input: CreateAdGroupsJobToolInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<CreateAdGroupsJobToolOutput> {
  const { ttdService } = resolveSessionServices(sdkContext);
  const job = (await ttdService.createAdGroupsJob({
    input: input.input,
    ...(input.validateInputOnly !== undefined ? { validateInputOnly: input.validateInputOnly } : {}),
    ...(input.callbackInput ? { callbackInput: toWorkflowCallbackInput(input.callbackInput) } : {}),
  }, context)) as Record<string, unknown>;
  return { job, timestamp: new Date().toISOString() };
}

export function createAdGroupsJobResponseFormatter(
  result: CreateAdGroupsJobToolOutput
): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Ad groups job submitted:\n\n${JSON.stringify(result.job, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const createAdGroupsJobTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: CreateAdGroupsJobToolInputSchema,
  outputSchema: CreateAdGroupsJobToolOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    destructiveHint: true,
    idempotentHint: false,
  },
  inputExamples: [
    {
      label: "Submit ad groups create job",
      input: {
        input: [
          {
            campaignId: "camp123",
            primaryInput: {
              name: "Ad Group One",
            },
          },
        ],
      },
    },
  ],
  logic: createAdGroupsJobLogic,
  responseFormatter: createAdGroupsJobResponseFormatter,
};

// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
  AdGroupCreateWorkflowInputSchema,
  AdGroupsJobInputSchema,
  toWorkflowCallbackInput,
} from "../utils/workflow-schemas.js";
import type { McpTextContent, RequestContext, SdkContext } from "@cesteral/shared";

const TOOL_NAME = "ttd_create_ad_groups";
const TOOL_TITLE = "TTD Create Ad Groups";
const TOOL_DESCRIPTION = `Create one or more ad groups through the TTD Workflows API.

- \`mode: "single"\` — synchronous create of a single ad group with workflow-aware payload.
- \`mode: "batch"\` — submit an async Workflows job that creates multiple ad groups. Returns a JobId; poll status with \`ttd_get_job_status\`.`;

export const CreateAdGroupsToolInputSchema = z
  .discriminatedUnion("mode", [
    AdGroupCreateWorkflowInputSchema.extend({
      mode: z
        .literal("single")
        .describe("Synchronous single-ad-group create via Workflows API"),
    }),
    AdGroupsJobInputSchema.extend({
      mode: z.literal("batch").describe("Async bulk-create job via Workflows API"),
    }),
  ])
  .describe("Parameters for creating ad groups via the TTD Workflows API");

export const CreateAdGroupsToolOutputSchema = z.object({
  mode: z.enum(["single", "batch"]),
  adGroup: z
    .record(z.unknown())
    .optional()
    .describe("Ad group workflow response (mode=single)"),
  job: z.record(z.unknown()).optional().describe("Job submission response (mode=batch)"),
  timestamp: z.string().datetime(),
});

type CreateAdGroupsToolInput = z.infer<typeof CreateAdGroupsToolInputSchema>;
type CreateAdGroupsToolOutput = z.infer<typeof CreateAdGroupsToolOutputSchema>;

export async function createAdGroupsLogic(
  input: CreateAdGroupsToolInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<CreateAdGroupsToolOutput> {
  const { ttdService } = resolveSessionServices(sdkContext);
  const timestamp = new Date().toISOString();

  if (input.mode === "single") {
    const { mode: _mode, ...payload } = input;
    const adGroup = (await ttdService.createAdGroupWorkflow(payload, context)) as Record<
      string,
      unknown
    >;
    return { mode: "single", adGroup, timestamp };
  }

  const job = (await ttdService.createAdGroupsJob(
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

export function createAdGroupsResponseFormatter(
  result: CreateAdGroupsToolOutput
): McpTextContent[] {
  const body =
    result.mode === "single"
      ? `Ad group workflow response:\n\n${JSON.stringify(result.adGroup, null, 2)}`
      : `Ad groups job submitted:\n\n${JSON.stringify(result.job, null, 2)}`;
  return [{ type: "text" as const, text: `${body}\n\nTimestamp: ${result.timestamp}` }];
}

export const createAdGroupsTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: CreateAdGroupsToolInputSchema,
  outputSchema: CreateAdGroupsToolOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    destructiveHint: true,
    idempotentHint: false,
  },
  inputExamples: [
    {
      label: "Create a single ad group (workflow)",
      input: {
        mode: "single",
        campaignId: "camp123",
        primaryInput: {
          name: "Workflow Ad Group",
          channel: "DISPLAY",
        },
      },
    },
    {
      label: "Submit batch ad-group-create job",
      input: {
        mode: "batch",
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
  logic: createAdGroupsLogic,
  responseFormatter: createAdGroupsResponseFormatter,
};

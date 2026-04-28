// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
  AdGroupUpdateWorkflowInputSchema,
  AdGroupsUpdateJobInputSchema,
  toWorkflowCallbackInput,
} from "../utils/workflow-schemas.js";
import type { McpTextContent, RequestContext, SdkContext } from "@cesteral/shared";

const TOOL_NAME = "ttd_update_ad_groups";
const TOOL_TITLE = "TTD Update Ad Groups";
const TOOL_DESCRIPTION = `Update one or more ad groups through the TTD Workflows API (PATCH semantics).

- \`mode: "single"\` — synchronous PATCH of a single ad group by id.
- \`mode: "batch"\` — submit an async Workflows job that updates multiple ad groups. Returns a JobId; poll status with \`ttd_get_job_status\`.`;

export const UpdateAdGroupsToolInputSchema = z
  .discriminatedUnion("mode", [
    AdGroupUpdateWorkflowInputSchema.extend({
      mode: z
        .literal("single")
        .describe("Synchronous single-ad-group PATCH via Workflows API"),
    }),
    AdGroupsUpdateJobInputSchema.extend({
      mode: z.literal("batch").describe("Async bulk-update job via Workflows API"),
    }),
  ])
  .describe("Parameters for updating ad groups via the TTD Workflows API");

export const UpdateAdGroupsToolOutputSchema = z.object({
  mode: z.enum(["single", "batch"]),
  adGroup: z
    .record(z.unknown())
    .optional()
    .describe("Ad group workflow response (mode=single)"),
  job: z.record(z.unknown()).optional().describe("Job submission response (mode=batch)"),
  timestamp: z.string().datetime(),
});

type UpdateAdGroupsToolInput = z.infer<typeof UpdateAdGroupsToolInputSchema>;
type UpdateAdGroupsToolOutput = z.infer<typeof UpdateAdGroupsToolOutputSchema>;

export async function updateAdGroupsLogic(
  input: UpdateAdGroupsToolInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<UpdateAdGroupsToolOutput> {
  const { ttdService } = resolveSessionServices(sdkContext);
  const timestamp = new Date().toISOString();

  if (input.mode === "single") {
    const { mode: _mode, ...payload } = input;
    const adGroup = (await ttdService.updateAdGroupWorkflow(payload, context)) as Record<
      string,
      unknown
    >;
    return { mode: "single", adGroup, timestamp };
  }

  const job = (await ttdService.updateAdGroupsJob(
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

export function updateAdGroupsResponseFormatter(
  result: UpdateAdGroupsToolOutput
): McpTextContent[] {
  const body =
    result.mode === "single"
      ? `Ad group workflow update response:\n\n${JSON.stringify(result.adGroup, null, 2)}`
      : `Ad groups update job submitted:\n\n${JSON.stringify(result.job, null, 2)}`;
  return [{ type: "text" as const, text: `${body}\n\nTimestamp: ${result.timestamp}` }];
}

export const updateAdGroupsTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: UpdateAdGroupsToolInputSchema,
  outputSchema: UpdateAdGroupsToolOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    destructiveHint: true,
    idempotentHint: false,
  },
  inputExamples: [
    {
      label: "Update a single ad group (workflow)",
      input: {
        mode: "single",
        id: "ag123",
        primaryInput: {
          name: "Updated Workflow Ad Group",
        },
      },
    },
    {
      label: "Submit batch ad-group-update job",
      input: {
        mode: "batch",
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
  logic: updateAdGroupsLogic,
  responseFormatter: updateAdGroupsResponseFormatter,
};

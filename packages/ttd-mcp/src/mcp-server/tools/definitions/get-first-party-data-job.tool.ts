// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
  FirstPartyDataJobInputSchema,
  toWorkflowCallbackInput,
} from "../utils/workflow-schemas.js";
import type { McpTextContent, RequestContext, SdkContext } from "@cesteral/shared";

const TOOL_NAME = "ttd_get_first_party_data_job";
const TOOL_TITLE = "TTD Get First-Party Data Job";
const TOOL_DESCRIPTION = `Submit a Workflows job for first-party data retrieval for an advertiser.

The returned job ID can be polled with \`ttd_get_job_status\`.`;

export const GetFirstPartyDataJobToolInputSchema = FirstPartyDataJobInputSchema.describe(
  "Parameters for submitting a first-party data retrieval job"
);

export const GetFirstPartyDataJobToolOutputSchema = z.object({
  job: z.record(z.unknown()).describe("Raw job submission response"),
  timestamp: z.string().datetime(),
});

type GetFirstPartyDataJobToolInput = z.infer<typeof GetFirstPartyDataJobToolInputSchema>;
type GetFirstPartyDataJobToolOutput = z.infer<typeof GetFirstPartyDataJobToolOutputSchema>;

export async function getFirstPartyDataJobLogic(
  input: GetFirstPartyDataJobToolInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetFirstPartyDataJobToolOutput> {
  const { ttdService } = resolveSessionServices(sdkContext);
  const job = (await ttdService.getFirstPartyDataJob(
    {
      advertiserId: input.advertiserId,
      ...(input.nameFilter !== undefined ? { nameFilter: input.nameFilter } : {}),
      ...(input.queryShape !== undefined ? { queryShape: input.queryShape } : {}),
      ...(input.callbackInput
        ? { callbackInput: toWorkflowCallbackInput(input.callbackInput) }
        : {}),
    },
    context
  )) as Record<string, unknown>;
  return { job, timestamp: new Date().toISOString() };
}

export function getFirstPartyDataJobResponseFormatter(
  result: GetFirstPartyDataJobToolOutput
): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `First-party data job submitted:\n\n${JSON.stringify(result.job, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const getFirstPartyDataJobTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: GetFirstPartyDataJobToolInputSchema,
  outputSchema: GetFirstPartyDataJobToolOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    destructiveHint: false,
    idempotentHint: false,
  },
  inputExamples: [
    {
      label: "Submit first-party data job",
      input: {
        advertiserId: "adv123",
        queryShape: "nodes { id name }",
      },
    },
  ],
  logic: getFirstPartyDataJobLogic,
  responseFormatter: getFirstPartyDataJobResponseFormatter,
};

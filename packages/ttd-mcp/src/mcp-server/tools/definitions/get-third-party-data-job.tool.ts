// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
  ThirdPartyDataJobInputSchema,
  toWorkflowCallbackInput,
} from "../utils/workflow-schemas.js";
import type { McpTextContent, RequestContext, SdkContext } from "@cesteral/shared";

const TOOL_NAME = "ttd_get_third_party_data_job";
const TOOL_TITLE = "TTD Get Third-Party Data Job";
const TOOL_DESCRIPTION = `Submit a Workflows job for third-party data retrieval for a partner.

The returned job ID can be polled with \`ttd_get_job_status\`.`;

export const GetThirdPartyDataJobToolInputSchema = ThirdPartyDataJobInputSchema.describe(
  "Parameters for submitting a third-party data retrieval job"
);

export const GetThirdPartyDataJobToolOutputSchema = z.object({
  job: z.record(z.unknown()).describe("Raw job submission response"),
  timestamp: z.string().datetime(),
});

type GetThirdPartyDataJobToolInput = z.infer<typeof GetThirdPartyDataJobToolInputSchema>;
type GetThirdPartyDataJobToolOutput = z.infer<typeof GetThirdPartyDataJobToolOutputSchema>;

export async function getThirdPartyDataJobLogic(
  input: GetThirdPartyDataJobToolInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetThirdPartyDataJobToolOutput> {
  const { ttdService } = resolveSessionServices(sdkContext);
  const job = (await ttdService.getThirdPartyDataJob({
    partnerId: input.partnerId,
    ...(input.queryShape !== undefined ? { queryShape: input.queryShape } : {}),
    ...(input.callbackInput ? { callbackInput: toWorkflowCallbackInput(input.callbackInput) } : {}),
  }, context)) as Record<string, unknown>;
  return { job, timestamp: new Date().toISOString() };
}

export function getThirdPartyDataJobResponseFormatter(
  result: GetThirdPartyDataJobToolOutput
): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Third-party data job submitted:\n\n${JSON.stringify(result.job, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const getThirdPartyDataJobTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: GetThirdPartyDataJobToolInputSchema,
  outputSchema: GetThirdPartyDataJobToolOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    destructiveHint: false,
    idempotentHint: false,
  },
  inputExamples: [
    {
      label: "Submit third-party data job",
      input: {
        partnerId: "partner123",
        queryShape: "nodes { id name providerId }",
      },
    },
  ],
  logic: getThirdPartyDataJobLogic,
  responseFormatter: getThirdPartyDataJobResponseFormatter,
};

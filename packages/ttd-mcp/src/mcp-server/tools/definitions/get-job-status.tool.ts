// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { McpTextContent, RequestContext, SdkContext } from "@cesteral/shared";

const TOOL_NAME = "ttd_get_job_status";
const TOOL_TITLE = "TTD Get Job Status";
const TOOL_DESCRIPTION = `Get the status of a previously submitted standard Workflows job.

Use this after tools like \`ttd_get_first_party_data_job\`, \`ttd_get_third_party_data_job\`,
\`ttd_create_campaigns_job\`, or \`ttd_create_ad_groups_job\`.`;

export const GetJobStatusInputSchema = z.object({
  jobId: z.number().int().positive().describe("Standard job ID returned by a TTD Workflows async endpoint"),
});

export const GetJobStatusOutputSchema = z.object({
  jobStatus: z.record(z.unknown()).describe("Raw standard job status payload"),
  timestamp: z.string().datetime(),
});

type GetJobStatusInput = z.infer<typeof GetJobStatusInputSchema>;
type GetJobStatusOutput = z.infer<typeof GetJobStatusOutputSchema>;

export async function getJobStatusLogic(
  input: GetJobStatusInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetJobStatusOutput> {
  const { ttdService } = resolveSessionServices(sdkContext);
  const jobStatus = (await ttdService.getJobStatus(input.jobId, context)) as Record<string, unknown>;
  return { jobStatus, timestamp: new Date().toISOString() };
}

export function getJobStatusResponseFormatter(result: GetJobStatusOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Job status:\n\n${JSON.stringify(result.jobStatus, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const getJobStatusTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: GetJobStatusInputSchema,
  outputSchema: GetJobStatusOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    destructiveHint: false,
    idempotentHint: true,
  },
  inputExamples: [
    {
      label: "Check standard job status",
      input: { jobId: 412651 },
    },
  ],
  logic: getJobStatusLogic,
  responseFormatter: getJobStatusResponseFormatter,
};

// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { ReportStatusSchema, assertAccountScope } from "@cesteral/shared";
import type { RequestContext, McpTextContent, SdkContext } from "@cesteral/shared";

const TOOL_NAME = "{{key}}_check_report_status";
const TOOL_TITLE = "Check {{displayName}} Report Status";
const TOOL_DESCRIPTION = `Check a {{displayName}} report job submitted with \`{{key}}_submit_report\`. When \`isComplete\` is true, fetch it with \`{{key}}_download_report\`.`;

export const CheckReportStatusInputSchema = z
  .object({
    accountId: z.string().min(1).describe("{{displayName}} account ID"),
    reportId: z.string().min(1).describe("Report job ID from {{key}}_submit_report"),
  })
  .describe("Parameters for checking a {{displayName}} report");

export const CheckReportStatusOutputSchema = ReportStatusSchema.extend({
  reportId: z.string(),
  rawStatus: z.string().describe("The platform's own status string"),
  isComplete: z.boolean(),
  timestamp: z.string().datetime(),
}).describe("Report status");

type Input = z.infer<typeof CheckReportStatusInputSchema>;
type Output = z.infer<typeof CheckReportStatusOutputSchema>;

export async function checkReportStatusLogic(
  input: Input,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<Output> {
  const { {{key}}ReportingService, boundAccountId } = resolveSessionServices(sdkContext);
  assertAccountScope(input.accountId, boundAccountId, "accountId");
  const status = await {{key}}ReportingService.getReportStatus(
    input.accountId,
    input.reportId,
    context
  );
  return {
    ...status,
    reportId: input.reportId,
    isComplete: status.state === "complete",
    timestamp: new Date().toISOString(),
  };
}

export function checkReportStatusResponseFormatter(result: Output): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Report ${result.reportId}: ${result.state} (${result.rawStatus})\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const checkReportStatusTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: CheckReportStatusInputSchema,
  outputSchema: CheckReportStatusOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    idempotentHint: true,
    destructiveHint: false,
  },
  inputExamples: [
    { label: "Check a report job", input: { accountId: "1234567890", reportId: "r-123" } },
  ],
  logic: checkReportStatusLogic,
  responseFormatter: checkReportStatusResponseFormatter,
  untrustedContent: {
    structuredPaths: ["$.errors", "$.rawStatus"],
    contentBlocks: [0],
  },
};

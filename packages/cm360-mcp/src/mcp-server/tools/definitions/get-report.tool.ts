import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "cm360_get_report";
const TOOL_TITLE = "Get CM360 Report";
const TOOL_DESCRIPTION = `Create and run a CM360 report, polling until completion (blocking).

Uses the CM360 Reports API async workflow:
1. Create report definition
2. Trigger execution
3. Poll until REPORT_AVAILABLE
4. Return download URL

This may take 30-120 seconds depending on report complexity.`;

export const GetReportInputSchema = z
  .object({
    profileId: z
      .string()
      .min(1)
      .describe("CM360 User Profile ID"),
    name: z
      .string()
      .describe("Name for the report"),
    type: z
      .enum(["STANDARD", "REACH", "PATH_TO_CONVERSION", "CROSS_DIMENSION_REACH", "FLOODLIGHT"])
      .describe("Report type"),
    criteria: z
      .record(z.any())
      .optional()
      .describe("Report criteria including dateRange, dimensions, metricNames, and dimensionFilters"),
    additionalConfig: z
      .record(z.any())
      .optional()
      .describe("Additional report configuration fields (schedule, delivery, etc.)"),
  })
  .describe("Parameters for generating a CM360 report");

export const GetReportOutputSchema = z
  .object({
    reportId: z.string().describe("Report ID"),
    fileId: z.string().describe("Report file ID"),
    file: z.record(z.any()).describe("Report file details"),
    downloadUrl: z.string().optional().describe("URL to download report results"),
    timestamp: z.string().datetime(),
  })
  .describe("Report generation result");

type GetReportInput = z.infer<typeof GetReportInputSchema>;
type GetReportOutput = z.infer<typeof GetReportOutputSchema>;

export async function getReportLogic(
  input: GetReportInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetReportOutput> {
  const { cm360ReportingService } = resolveSessionServices(sdkContext);

  const reportConfig = {
    name: input.name,
    type: input.type,
    ...(input.criteria && { criteria: input.criteria }),
    ...input.additionalConfig,
  };

  const result = (await cm360ReportingService.runReport(
    input.profileId,
    reportConfig,
    context
  )) as Record<string, unknown>;

  return {
    reportId: result.reportId as string,
    fileId: result.fileId as string,
    file: (result.file as Record<string, any>) || {},
    downloadUrl: result.downloadUrl as string | undefined,
    timestamp: new Date().toISOString(),
  };
}

export function getReportResponseFormatter(result: GetReportOutput): unknown[] {
  const downloadInfo = result.downloadUrl
    ? `\n\nDownload URL: ${result.downloadUrl}`
    : "\n\nNo download URL available yet.";

  return [
    {
      type: "text" as const,
      text: `Report generated: ${result.reportId} (file: ${result.fileId})${downloadInfo}\n\nFile details:\n${JSON.stringify(result.file, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const getReportTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: GetReportInputSchema,
  outputSchema: GetReportOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    destructiveHint: false,
    idempotentHint: false,
  },
  inputExamples: [
    {
      label: "Standard campaign delivery report",
      input: {
        profileId: "123456",
        name: "Campaign Delivery - Last 7 Days",
        type: "STANDARD",
        criteria: {
          dateRange: { relativeDateRange: "LAST_7_DAYS" },
          dimensions: [
            { name: "campaign" },
            { name: "date" },
          ],
          metricNames: ["impressions", "clicks", "totalConversions", "mediaCost"],
        },
      },
    },
    {
      label: "Floodlight conversion report",
      input: {
        profileId: "123456",
        name: "Floodlight Conversions MTD",
        type: "FLOODLIGHT",
        criteria: {
          dateRange: { relativeDateRange: "MONTH_TO_DATE" },
          dimensions: [
            { name: "activity" },
            { name: "campaign" },
          ],
          metricNames: ["floodlightImpressions", "floodlightClicks", "floodlightRevenue"],
        },
      },
    },
  ],
  logic: getReportLogic,
  responseFormatter: getReportResponseFormatter,
};

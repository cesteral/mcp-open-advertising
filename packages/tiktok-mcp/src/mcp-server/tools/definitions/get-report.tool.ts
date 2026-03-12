import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "tiktok_get_report";
const TOOL_TITLE = "Get TikTok Ads Report";
const TOOL_DESCRIPTION = `Submit and retrieve an async TikTok Ads performance report.

Follows the async polling pattern: submit task → poll until DONE → download CSV.
This may take 30s–5 minutes depending on the data volume.

**Common dimensions:** campaign_id, adgroup_id, ad_id, stat_time_day, stat_time_hour, country_code
**Common metrics:** spend, impressions, clicks, ctr, cpm, cpc, conversions, conversion_rate, reach, frequency

**Report types:** BASIC (default), AUDIENCE, PLAYABLE_MATERIAL`;

export const GetReportInputSchema = z
  .object({
    advertiserId: z
      .string()
      .min(1)
      .describe("TikTok Advertiser ID"),
    reportType: z
      .enum(["BASIC", "AUDIENCE", "PLAYABLE_MATERIAL"])
      .optional()
      .default("BASIC")
      .describe("Report type (default: BASIC)"),
    dimensions: z
      .array(z.string())
      .min(1)
      .describe("Dimensions for the report (e.g., ['campaign_id', 'stat_time_day'])"),
    metrics: z
      .array(z.string())
      .min(1)
      .describe("Metrics to include (e.g., ['impressions', 'clicks', 'spend'])"),
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .describe("Start date (YYYY-MM-DD)"),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .describe("End date (YYYY-MM-DD)"),
    orderField: z
      .string()
      .optional()
      .describe("Field to order results by"),
    orderType: z
      .enum(["ASC", "DESC"])
      .optional()
      .describe("Sort order"),
  })
  .describe("Parameters for generating a TikTok Ads report");

export const GetReportOutputSchema = z
  .object({
    taskId: z.string().describe("Report task ID"),
    headers: z.array(z.string()).describe("CSV column headers"),
    rows: z.array(z.array(z.string())).describe("CSV data rows"),
    totalRows: z.number().describe("Total number of data rows"),
    timestamp: z.string().datetime(),
  })
  .describe("Report result");

type GetReportInput = z.infer<typeof GetReportInputSchema>;
type GetReportOutput = z.infer<typeof GetReportOutputSchema>;

export async function getReportLogic(
  input: GetReportInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetReportOutput> {
  const { tiktokReportingService } = resolveSessionServices(sdkContext);

  const result = await tiktokReportingService.getReport(
    {
      report_type: input.reportType,
      dimensions: input.dimensions,
      metrics: input.metrics,
      start_date: input.startDate,
      end_date: input.endDate,
      ...(input.orderField ? { order_field: input.orderField } : {}),
      ...(input.orderType ? { order_type: input.orderType } : {}),
    },
    context
  );

  return {
    taskId: result.taskId,
    headers: result.headers,
    rows: result.rows,
    totalRows: result.totalRows,
    timestamp: new Date().toISOString(),
  };
}

export function getReportResponseFormatter(result: GetReportOutput): McpTextContent[] {
  const headerLine = result.headers.join(", ");
  const previewRows = result.rows.slice(0, 5).map((row) => row.join(", "));
  const truncated = result.rows.length > 5
    ? `\n... and ${result.rows.length - 5} more rows`
    : "";

  return [
    {
      type: "text" as const,
      text: [
        `Report task: ${result.taskId}`,
        `Total rows: ${result.totalRows}`,
        "",
        `Headers: ${headerLine}`,
        "",
        "Sample rows:",
        ...previewRows,
        truncated,
        "",
        `Timestamp: ${result.timestamp}`,
      ].filter((line) => line !== undefined).join("\n"),
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
    idempotentHint: false,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Campaign delivery report for last 7 days",
      input: {
        advertiserId: "1234567890",
        dimensions: ["campaign_id", "stat_time_day"],
        metrics: ["impressions", "clicks", "spend", "ctr", "cpc"],
        startDate: "2026-02-24",
        endDate: "2026-03-04",
      },
    },
    {
      label: "Ad group performance report",
      input: {
        advertiserId: "1234567890",
        reportType: "BASIC",
        dimensions: ["adgroup_id"],
        metrics: ["impressions", "clicks", "spend", "conversions", "conversion_rate"],
        startDate: "2026-03-01",
        endDate: "2026-03-04",
        orderField: "spend",
        orderType: "DESC",
      },
    },
  ],
  logic: getReportLogic,
  responseFormatter: getReportResponseFormatter,
};

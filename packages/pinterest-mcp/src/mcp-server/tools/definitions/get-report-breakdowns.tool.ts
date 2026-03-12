import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "pinterest_get_report_breakdowns";
const TOOL_TITLE = "Get Pinterest Ads Report with Breakdowns";
const TOOL_DESCRIPTION = `Submit and retrieve an async Pinterest Ads report with dimensional breakdowns.

Like \`pinterest_get_report\` but adds breakdown dimensions for more granular data.

**Common breakdown dimensions:** country_code, platform, gender, age, interest_category, placement

Results are broken down by each combination of base dimensions + breakdown dimensions.`;

export const GetReportBreakdownsInputSchema = z
  .object({
    adAccountId: z
      .string()
      .min(1)
      .describe("Pinterest Advertiser ID"),
    reportType: z
      .enum(["BASIC", "AUDIENCE", "PLAYABLE_MATERIAL"])
      .optional()
      .default("BASIC")
      .describe("Report type (default: BASIC)"),
    dimensions: z
      .array(z.string())
      .min(1)
      .describe("Base dimensions for the report (e.g., ['campaign_id', 'stat_time_day'])"),
    breakdowns: z
      .array(z.string())
      .min(1)
      .describe("Breakdown dimensions to add (e.g., ['country_code', 'gender'])"),
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
  })
  .describe("Parameters for generating a Pinterest Ads report with breakdowns");

export const GetReportBreakdownsOutputSchema = z
  .object({
    taskId: z.string().describe("Report task ID"),
    headers: z.array(z.string()).describe("CSV column headers"),
    rows: z.array(z.array(z.string())).describe("CSV data rows"),
    totalRows: z.number().describe("Total number of data rows"),
    appliedDimensions: z.array(z.string()).describe("All dimensions used (base + breakdowns)"),
    timestamp: z.string().datetime(),
  })
  .describe("Report with breakdowns result");

type GetReportBreakdownsInput = z.infer<typeof GetReportBreakdownsInputSchema>;
type GetReportBreakdownsOutput = z.infer<typeof GetReportBreakdownsOutputSchema>;

export async function getReportBreakdownsLogic(
  input: GetReportBreakdownsInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetReportBreakdownsOutput> {
  const { pinterestReportingService } = resolveSessionServices(sdkContext);

  const result = await pinterestReportingService.getReportBreakdowns(
    {
      report_type: input.reportType,
      dimensions: input.dimensions,
      metrics: input.metrics,
      start_date: input.startDate,
      end_date: input.endDate,
    },
    input.breakdowns,
    context
  );

  return {
    taskId: result.taskId,
    headers: result.headers,
    rows: result.rows,
    totalRows: result.totalRows,
    appliedDimensions: [...input.dimensions, ...input.breakdowns],
    timestamp: new Date().toISOString(),
  };
}

export function getReportBreakdownsResponseFormatter(result: GetReportBreakdownsOutput): McpTextContent[] {
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
        `Applied dimensions: ${result.appliedDimensions.join(", ")}`,
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

export const getReportBreakdownsTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: GetReportBreakdownsInputSchema,
  outputSchema: GetReportBreakdownsOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    idempotentHint: false,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Campaign report broken down by country",
      input: {
        adAccountId: "1234567890",
        dimensions: ["campaign_id", "stat_time_day"],
        breakdowns: ["country_code"],
        metrics: ["impressions", "clicks", "spend", "ctr"],
        startDate: "2026-03-01",
        endDate: "2026-03-04",
      },
    },
    {
      label: "Ad group report broken down by gender and age",
      input: {
        adAccountId: "1234567890",
        dimensions: ["adgroup_id"],
        breakdowns: ["gender", "age"],
        metrics: ["impressions", "clicks", "spend", "conversions"],
        startDate: "2026-03-01",
        endDate: "2026-03-04",
      },
    },
  ],
  logic: getReportBreakdownsLogic,
  responseFormatter: getReportBreakdownsResponseFormatter,
};

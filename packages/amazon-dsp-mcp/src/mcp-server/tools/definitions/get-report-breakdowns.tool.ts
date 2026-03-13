import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "amazon_dsp_get_report_breakdowns";
const TOOL_TITLE = "Get Amazon DSP Report with Breakdowns";
const TOOL_DESCRIPTION = `Submit and retrieve an async Amazon DSP report with additional breakdown groupBy dimensions.

Like \`amazon_dsp_get_report\` but adds extra breakdown dimensions for more granular data.

**Common breakdown groupBy:** date, geography, device, creative

Results include metrics broken down by the additional groupBy dimensions.`;

export const GetReportBreakdownsInputSchema = z
  .object({
    profileId: z
      .string()
      .min(1)
      .describe("Amazon DSP Profile/Advertiser ID"),
    name: z
      .string()
      .optional()
      .describe("Report name (optional)"),
    startDate: z
      .string()
      .regex(/^\d{8}$/)
      .describe("Start date (YYYYMMDD format, e.g. 20240101)"),
    endDate: z
      .string()
      .regex(/^\d{8}$/)
      .describe("End date (YYYYMMDD format, e.g. 20240131)"),
    reportTypeId: z
      .string()
      .min(1)
      .describe("Report type ID (e.g. dspLineItem, dspOrder, dspCreative)"),
    groupBy: z
      .array(z.string())
      .min(1)
      .describe("Base dimensions to group by (e.g. ['order', 'lineItem'])"),
    breakdowns: z
      .array(z.string())
      .min(1)
      .describe("Additional breakdown groupBy dimensions (e.g. ['date', 'geography'])"),
    columns: z
      .array(z.string())
      .min(1)
      .describe("Metrics/columns to include (e.g. ['impressions', 'clickThroughs', 'totalCost'])"),
    timeUnit: z
      .enum(["DAILY", "SUMMARY"])
      .optional()
      .default("DAILY")
      .describe("Time unit for the report (default: DAILY)"),
    adProduct: z
      .string()
      .optional()
      .default("DSP")
      .describe("Ad product type (default: DSP)"),
  })
  .describe("Parameters for generating an Amazon DSP report with breakdowns");

export const GetReportBreakdownsOutputSchema = z
  .object({
    taskId: z.string().describe("Report task ID"),
    headers: z.array(z.string()).describe("CSV column headers"),
    rows: z.array(z.array(z.string())).describe("CSV data rows"),
    totalRows: z.number().describe("Total number of data rows"),
    appliedGroupBy: z.array(z.string()).describe("All groupBy dimensions used (base + breakdowns)"),
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
  const { amazonDspReportingService } = resolveSessionServices(sdkContext);

  const result = await amazonDspReportingService.getReportBreakdowns(
    {
      name: input.name,
      startDate: input.startDate,
      endDate: input.endDate,
      configuration: {
        adProduct: input.adProduct,
        groupBy: input.groupBy,
        columns: input.columns,
        reportTypeId: input.reportTypeId,
        timeUnit: input.timeUnit,
      },
    },
    input.breakdowns,
    context
  );

  return {
    taskId: result.taskId,
    headers: result.headers,
    rows: result.rows,
    totalRows: result.totalRows,
    appliedGroupBy: [...input.groupBy, ...input.breakdowns],
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
        `Applied groupBy: ${result.appliedGroupBy.join(", ")}`,
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
      label: "Line item report broken down by geography",
      input: {
        profileId: "1234567890",
        startDate: "20260301",
        endDate: "20260304",
        reportTypeId: "dspLineItem",
        groupBy: ["order", "lineItem"],
        breakdowns: ["geography"],
        columns: ["impressions", "clickThroughs", "totalCost"],
        timeUnit: "DAILY",
      },
    },
    {
      label: "Order report broken down by device",
      input: {
        profileId: "1234567890",
        startDate: "20260301",
        endDate: "20260304",
        reportTypeId: "dspOrder",
        groupBy: ["order"],
        breakdowns: ["device"],
        columns: ["impressions", "clickThroughs", "totalCost"],
        timeUnit: "SUMMARY",
      },
    },
  ],
  logic: getReportBreakdownsLogic,
  responseFormatter: getReportBreakdownsResponseFormatter,
};

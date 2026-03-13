import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "amazon_dsp_submit_report";
const TOOL_TITLE = "Submit Amazon DSP Report";
const TOOL_DESCRIPTION = `Submit an Amazon DSP report task without waiting for completion.

Returns a \`taskId\` immediately. Use \`amazon_dsp_check_report_status\` to poll for completion, then \`amazon_dsp_download_report\` to fetch results.

**Non-blocking workflow:**
1. \`amazon_dsp_submit_report\` → get \`taskId\`
2. \`amazon_dsp_check_report_status\` (repeat every 10s) → wait for "COMPLETED"
3. \`amazon_dsp_download_report\` with the \`downloadUrl\` → get parsed data

Use \`amazon_dsp_get_report\` instead for a blocking convenience shortcut.`;

export const SubmitReportInputSchema = z
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
      .describe("Dimensions to group by (e.g. ['order', 'lineItem'])"),
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
  .describe("Parameters for submitting an Amazon DSP report");

export const SubmitReportOutputSchema = z
  .object({
    taskId: z.string().describe("Report task ID for status polling"),
    timestamp: z.string().datetime(),
  })
  .describe("Report submission result");

type SubmitReportInput = z.infer<typeof SubmitReportInputSchema>;
type SubmitReportOutput = z.infer<typeof SubmitReportOutputSchema>;

export async function submitReportLogic(
  input: SubmitReportInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<SubmitReportOutput> {
  const { amazonDspReportingService } = resolveSessionServices(sdkContext);

  const result = await amazonDspReportingService.submitReport(
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
    context
  );

  return {
    taskId: result.task_id,
    timestamp: new Date().toISOString(),
  };
}

export function submitReportResponseFormatter(result: SubmitReportOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Report submitted: ${result.taskId}\n\nUse \`amazon_dsp_check_report_status\` with this taskId to poll for completion.\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const submitReportTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: SubmitReportInputSchema,
  outputSchema: SubmitReportOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    destructiveHint: false,
    idempotentHint: false,
  },
  inputExamples: [
    {
      label: "Submit line item performance report",
      input: {
        profileId: "1234567890",
        startDate: "20260224",
        endDate: "20260304",
        reportTypeId: "dspLineItem",
        groupBy: ["order", "lineItem"],
        columns: ["impressions", "clickThroughs", "totalCost"],
        timeUnit: "DAILY",
      },
    },
  ],
  logic: submitReportLogic,
  responseFormatter: submitReportResponseFormatter,
};

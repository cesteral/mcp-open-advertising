import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "amazon_dsp_submit_report";
const TOOL_TITLE = "Submit AmazonDsp Report";
const TOOL_DESCRIPTION = `Submit a AmazonDsp Ads report task without waiting for completion.

Returns a \`taskId\` immediately. Use \`amazon_dsp_check_report_status\` to poll for completion, then \`amazon_dsp_download_report\` to fetch results.

**Non-blocking workflow:**
1. \`amazon_dsp_submit_report\` → get \`taskId\`
2. \`amazon_dsp_check_report_status\` (repeat every 10s) → wait for "DONE"
3. \`amazon_dsp_download_report\` with the \`downloadUrl\` → get parsed data

Use \`amazon_dsp_get_report\` instead for a blocking convenience shortcut.`;

export const SubmitReportInputSchema = z
  .object({
    profileId: z
      .string()
      .min(1)
      .describe("AmazonDsp Advertiser ID"),
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
  .describe("Parameters for submitting a AmazonDsp Ads report");

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
      label: "Submit campaign performance report",
      input: {
        profileId: "1234567890",
        dimensions: ["campaign_id", "stat_time_day"],
        metrics: ["impressions", "clicks", "spend", "ctr", "cpc"],
        startDate: "2026-02-24",
        endDate: "2026-03-04",
      },
    },
  ],
  logic: submitReportLogic,
  responseFormatter: submitReportResponseFormatter,
};

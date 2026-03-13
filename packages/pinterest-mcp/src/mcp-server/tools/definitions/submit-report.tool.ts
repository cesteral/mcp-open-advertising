import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "pinterest_submit_report";
const TOOL_TITLE = "Submit Pinterest Report";
const TOOL_DESCRIPTION = `Submit a Pinterest Ads report task without waiting for completion.

Returns a \`taskId\` immediately. Use \`pinterest_check_report_status\` to poll for completion, then \`pinterest_download_report\` to fetch results.

**Non-blocking workflow:**
1. \`pinterest_submit_report\` → get \`taskId\`
2. \`pinterest_check_report_status\` (repeat every 10s) → wait for "FINISHED"
3. \`pinterest_download_report\` with the \`downloadUrl\` → get parsed data

Use \`pinterest_get_report\` instead for a blocking convenience shortcut.`;

export const SubmitReportInputSchema = z
  .object({
    adAccountId: z
      .string()
      .min(1)
      .describe("Pinterest Ad Account ID"),
    type: z
      .enum(["CAMPAIGN", "AD_GROUP", "AD", "KEYWORD", "ACCOUNT"])
      .optional()
      .default("CAMPAIGN")
      .describe("Report type (default: CAMPAIGN)"),
    columns: z
      .array(z.string())
      .min(1)
      .describe("Columns/metrics to include (e.g. ['IMPRESSION_1', 'CLICKTHROUGH_1', 'SPEND_IN_DOLLAR'])"),
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .describe("Start date (YYYY-MM-DD)"),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .describe("End date (YYYY-MM-DD)"),
    granularity: z
      .enum(["TOTAL", "DAY", "HOUR", "WEEK", "MONTH"])
      .optional()
      .default("DAY")
      .describe("Time granularity for the report (default: DAY)"),
    campaignIds: z
      .array(z.string())
      .optional()
      .describe("Filter by campaign IDs"),
    adGroupIds: z
      .array(z.string())
      .optional()
      .describe("Filter by ad group IDs"),
    adIds: z
      .array(z.string())
      .optional()
      .describe("Filter by ad IDs"),
  })
  .describe("Parameters for submitting a Pinterest Ads report");

export const SubmitReportOutputSchema = z
  .object({
    taskId: z.string().describe("Report token/task ID for status polling"),
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
  const { pinterestReportingService } = resolveSessionServices(sdkContext);

  const result = await pinterestReportingService.submitReport(
    {
      type: input.type,
      columns: input.columns,
      start_date: input.startDate,
      end_date: input.endDate,
      granularity: input.granularity,
      ...(input.campaignIds ? { campaign_ids: input.campaignIds } : {}),
      ...(input.adGroupIds ? { ad_group_ids: input.adGroupIds } : {}),
      ...(input.adIds ? { ad_ids: input.adIds } : {}),
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
      text: `Report submitted: ${result.taskId}\n\nUse \`pinterest_check_report_status\` with this taskId to poll for completion.\n\nTimestamp: ${result.timestamp}`,
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
        adAccountId: "1234567890",
        type: "CAMPAIGN",
        columns: ["IMPRESSION_1", "CLICKTHROUGH_1", "SPEND_IN_DOLLAR", "CTR", "CPM"],
        startDate: "2026-02-24",
        endDate: "2026-03-04",
        granularity: "DAY",
      },
    },
  ],
  logic: submitReportLogic,
  responseFormatter: submitReportResponseFormatter,
};

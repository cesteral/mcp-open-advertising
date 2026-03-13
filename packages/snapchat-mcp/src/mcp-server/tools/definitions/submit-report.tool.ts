import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "snapchat_submit_report";
const TOOL_TITLE = "Submit Snapchat Report";
const TOOL_DESCRIPTION = `Submit a Snapchat Ads report task without waiting for completion.

Returns a \`taskId\` immediately. Use \`snapchat_check_report_status\` to poll for completion, then \`snapchat_download_report\` to fetch results.

**Non-blocking workflow:**
1. \`snapchat_submit_report\` → get \`taskId\`
2. \`snapchat_check_report_status\` (repeat every 10s) → wait for "COMPLETE"
3. \`snapchat_download_report\` with the \`downloadUrl\` → get parsed data

Use \`snapchat_get_report\` instead for a blocking convenience shortcut.`;

export const SubmitReportInputSchema = z
  .object({
    adAccountId: z
      .string()
      .min(1)
      .describe("Snapchat Ad Account ID"),
    fields: z
      .array(z.string())
      .min(1)
      .describe("Metric fields to include (e.g. ['impressions', 'swipes', 'spend'])"),
    startTime: z
      .string()
      .describe("Start time in ISO 8601 format (e.g. 2024-01-01T00:00:00Z)"),
    endTime: z
      .string()
      .describe("End time in ISO 8601 format (e.g. 2024-01-31T23:59:59Z)"),
    granularity: z
      .enum(["DAY", "HOUR", "LIFETIME"])
      .optional()
      .default("DAY")
      .describe("Time granularity (default: DAY)"),
    filters: z
      .array(z.object({
        field: z.string().describe("Filter field (e.g. campaign_id)"),
        operator: z.string().describe("Filter operator (e.g. IN)"),
        values: z.array(z.string()).describe("Filter values"),
      }))
      .optional()
      .describe("Optional filters for the report"),
  })
  .describe("Parameters for submitting a Snapchat Ads report");

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
  const { snapchatReportingService } = resolveSessionServices(sdkContext);

  const result = await snapchatReportingService.submitReport(
    {
      fields: input.fields,
      granularity: input.granularity,
      start_time: input.startTime,
      end_time: input.endTime,
      ...(input.filters ? { filters: input.filters } : {}),
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
      text: `Report submitted: ${result.taskId}\n\nUse \`snapchat_check_report_status\` with this taskId to poll for completion.\n\nTimestamp: ${result.timestamp}`,
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
        fields: ["impressions", "swipes", "spend", "cpm"],
        startTime: "2026-02-24T00:00:00Z",
        endTime: "2026-03-04T23:59:59Z",
        granularity: "DAY",
      },
    },
  ],
  logic: submitReportLogic,
  responseFormatter: submitReportResponseFormatter,
};

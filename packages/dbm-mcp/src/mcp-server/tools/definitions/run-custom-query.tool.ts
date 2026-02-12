import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext } from "../../../utils/internal/request-context.js";
import type { SdkContext, ToolDefinition } from "../../../types-global/mcp.js";
import {
  isValidFilterType,
  isValidMetricType,
  isValidReportType,
  isValidDataRange,
} from "../../../generated/index.js";

const TOOL_NAME = "run_custom_query";
const TOOL_TITLE = "Run Custom Query";
const TOOL_DESCRIPTION = `Execute a custom Bid Manager API query with any combination of filters and metrics.

For available options, fetch these MCP Resources:
- filter-types://all - Complete list of ~280 filter/dimension types
- metric-types://all - Complete list of ~100 metric types
- report-types://all - Report types and date range presets
- query-examples://all - Example queries for common use cases

Common groupBys: FILTER_DATE, FILTER_CAMPAIGN, FILTER_LINE_ITEM, FILTER_DEVICE_TYPE
Common metrics: METRIC_IMPRESSIONS, METRIC_CLICKS, METRIC_CTR, METRIC_TOTAL_MEDIA_COST_ADVERTISER`;

/**
 * Input schema - uses simplified string types to stay under stdio limits
 * Full validation happens server-side using generated Zod schemas
 */
export const RunCustomQueryInputSchema = z
  .object({
    reportType: z
      .string()
      .default("STANDARD")
      .describe("Report type: STANDARD (default), FLOODLIGHT, YOUTUBE, GRP, REACH, UNIQUE_REACH_AUDIENCE"),

    groupBys: z
      .array(z.string())
      .min(1)
      .describe(
        "Dimensions to group results by (e.g., FILTER_DATE, FILTER_CAMPAIGN, FILTER_LINE_ITEM). See filter-types://all"
      ),

    metrics: z
      .array(z.string())
      .min(1)
      .describe(
        "Metrics to include (e.g., METRIC_IMPRESSIONS, METRIC_CLICKS, METRIC_CTR). See metric-types://all"
      ),

    filters: z
      .array(
        z.object({
          type: z.string().describe("Filter type (e.g., FILTER_ADVERTISER)"),
          value: z.string().describe("Filter value (e.g., advertiser ID)"),
        })
      )
      .optional()
      .describe("Filters to apply. Example: [{type: 'FILTER_ADVERTISER', value: '123456'}]"),

    dateRange: z
      .union([
        z.object({
          preset: z
            .string()
            .describe(
              "Preset: LAST_7_DAYS, LAST_30_DAYS, MONTH_TO_DATE, PREVIOUS_MONTH, YEAR_TO_DATE, etc."
            ),
        }),
        z.object({
          startDate: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
            .describe("Start date YYYY-MM-DD"),
          endDate: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
            .describe("End date YYYY-MM-DD"),
        }),
      ])
      .describe("Date range: {preset: 'LAST_7_DAYS'} or {startDate: '2025-01-01', endDate: '2025-01-31'}"),

    strictValidation: z
      .boolean()
      .optional()
      .default(true)
      .describe("If true (default), reject unknown filters/metrics. If false, pass through to API."),

    outputFormat: z
      .enum(["structured", "csv"])
      .optional()
      .default("structured")
      .describe("Output format: 'structured' (JSON array) or 'csv' (raw CSV string)"),
  })
  .describe("Parameters for executing a custom Bid Manager query");

/**
 * Output schema
 */
export const RunCustomQueryOutputSchema = z
  .object({
    queryId: z.string().describe("Bid Manager query ID"),
    reportId: z.string().describe("Bid Manager report ID"),
    status: z.string().describe("Query execution status"),
    rowCount: z.number().describe("Number of rows returned"),
    columns: z.array(z.string()).describe("Column names in the result"),
    data: z
      .union([z.array(z.record(z.any())), z.string()])
      .describe("Result data (JSON array or CSV string)"),
    warnings: z.array(z.string()).optional().describe("Any warnings during execution"),
    timestamp: z.string().datetime().describe("Execution timestamp"),
  })
  .describe("Custom query execution result");

export type RunCustomQueryInput = z.infer<typeof RunCustomQueryInputSchema>;
export type RunCustomQueryOutput = z.infer<typeof RunCustomQueryOutputSchema>;

/**
 * Validate filters and metrics against generated schemas
 */
function validateQueryParams(
  input: RunCustomQueryInput,
  strictValidation: boolean
): { warnings: string[]; errors: string[] } {
  const warnings: string[] = [];
  const errors: string[] = [];

  // Validate report type
  if (!isValidReportType(input.reportType)) {
    if (strictValidation) {
      errors.push(
        `Unknown report type: ${input.reportType}. Use report-types://all to see valid options.`
      );
    } else {
      warnings.push(`Unknown report type: ${input.reportType} - passing through to API`);
    }
  }

  // Validate groupBys
  for (const groupBy of input.groupBys) {
    if (!isValidFilterType(groupBy)) {
      if (strictValidation) {
        errors.push(`Unknown filter type in groupBys: ${groupBy}. Use filter-types://all to see valid options.`);
      } else {
        warnings.push(`Unknown filter type: ${groupBy} - passing through to API`);
      }
    }
  }

  // Validate metrics
  for (const metric of input.metrics) {
    if (!isValidMetricType(metric)) {
      if (strictValidation) {
        errors.push(`Unknown metric type: ${metric}. Use metric-types://all to see valid options.`);
      } else {
        warnings.push(`Unknown metric type: ${metric} - passing through to API`);
      }
    }
  }

  // Validate filter types in filters array
  if (input.filters) {
    for (const filter of input.filters) {
      if (!isValidFilterType(filter.type)) {
        if (strictValidation) {
          errors.push(
            `Unknown filter type in filters: ${filter.type}. Use filter-types://all to see valid options.`
          );
        } else {
          warnings.push(`Unknown filter type: ${filter.type} - passing through to API`);
        }
      }
    }
  }

  // Validate date range preset if provided
  if ("preset" in input.dateRange && !isValidDataRange(input.dateRange.preset)) {
    if (strictValidation) {
      errors.push(
        `Unknown date range preset: ${input.dateRange.preset}. Use report-types://all to see valid options.`
      );
    } else {
      warnings.push(`Unknown date range preset: ${input.dateRange.preset} - passing through to API`);
    }
  }

  return { warnings, errors };
}

/**
 * Tool logic
 */
export async function runCustomQueryLogic(
  input: RunCustomQueryInput,
  _context: RequestContext,
  sdkContext?: SdkContext
): Promise<RunCustomQueryOutput> {
  const strictValidation = input.strictValidation !== false;

  // Validate parameters
  const { warnings, errors } = validateQueryParams(input, strictValidation);

  if (errors.length > 0) {
    throw new Error(`Validation errors:\n${errors.join("\n")}`);
  }

  // Resolve BidManagerService from DI container
  const { bidManagerService } = resolveSessionServices(sdkContext);

  // Execute custom query via BidManagerService
  const result = await bidManagerService.executeCustomQuery({
    reportType: input.reportType,
    groupBys: input.groupBys,
    metrics: input.metrics,
    filters: input.filters,
    dateRange: input.dateRange,
    outputFormat: input.outputFormat,
  });

  return {
    queryId: result.queryId,
    reportId: result.reportId,
    status: result.status,
    rowCount: result.rowCount,
    columns: result.columns,
    data: result.data,
    warnings: warnings.length > 0 ? warnings : undefined,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Response formatter
 */
export function runCustomQueryResponseFormatter(
  result: RunCustomQueryOutput,
  input: RunCustomQueryInput
): any[] {
  const dateRangeStr =
    "preset" in input.dateRange
      ? input.dateRange.preset
      : `${input.dateRange.startDate} to ${input.dateRange.endDate}`;

  let dataPreview: string;
  if (typeof result.data === "string") {
    // CSV format - show first few lines
    const lines = result.data.split("\n");
    dataPreview =
      lines.length > 10 ? lines.slice(0, 10).join("\n") + "\n... (truncated)" : result.data;
  } else {
    // Structured format - show first few rows
    const preview = result.data.slice(0, 5);
    dataPreview =
      JSON.stringify(preview, null, 2) +
      (result.data.length > 5 ? `\n... (${result.data.length - 5} more rows)` : "");
  }

  return [
    {
      type: "text" as const,
      text: `Custom Query Results

Query Details:
- Report Type: ${input.reportType}
- Group By: ${input.groupBys.join(", ")}
- Metrics: ${input.metrics.join(", ")}
- Date Range: ${dateRangeStr}
- Filters: ${input.filters?.map((f) => `${f.type}=${f.value}`).join(", ") || "none"}
${result.warnings ? `\nWarnings:\n${result.warnings.map((w) => `- ${w}`).join("\n")}` : ""}

Results: ${result.rowCount} rows
Columns: ${result.columns.join(", ")}

Data Preview:
${dataPreview}`,
    },
  ];
}

/**
 * Tool definition
 */
export const runCustomQueryTool: ToolDefinition<
  typeof RunCustomQueryInputSchema,
  typeof RunCustomQueryOutputSchema
> = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: RunCustomQueryInputSchema,
  outputSchema: RunCustomQueryOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    idempotentHint: true,
  },
  logic: runCustomQueryLogic,
  responseFormatter: runCustomQueryResponseFormatter,
};

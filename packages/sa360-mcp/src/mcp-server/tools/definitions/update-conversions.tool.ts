import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "sa360_update_conversions";
const TOOL_TITLE = "Update SA360 Conversions";
const TOOL_DESCRIPTION = `Update existing conversions in SA360 via the legacy v2 API (DoubleClick Search).

Modify previously uploaded offline conversion data. Each conversion must be identified by its conversionId and conversionTimestamp.

**Important:**
- Uses the legacy v2 API endpoint (PUT), not the Reporting API
- Maximum 200 conversions per request
- conversionId is required for updates (returned from insert)
- conversionTimestamp must match the original value exactly`;

const ConversionUpdateRowSchema = z.object({
  clickId: z.string().optional().describe("SA360 click ID"),
  gclid: z.string().optional().describe("Google click ID"),
  conversionId: z.string().describe("Conversion ID (from original insert response)"),
  conversionTimestamp: z.string().describe("Original conversion timestamp (epoch milliseconds)"),
  revenueMicros: z.string().optional().describe("Updated revenue in micros"),
  currencyCode: z.string().optional().describe("ISO 4217 currency code"),
  quantityMillis: z.string().optional().describe("Updated conversion quantity in millis"),
  segmentationType: z.string().default("FLOODLIGHT").describe("Segment type"),
  segmentationName: z.string().optional().describe("Floodlight activity name"),
  floodlightActivityId: z.string().optional().describe("Floodlight activity ID"),
  type: z.string().optional().describe("Conversion type"),
  state: z.string().optional().describe("Set to REMOVED to delete the conversion"),
  customMetric: z
    .array(z.object({ name: z.string(), value: z.number() }))
    .optional()
    .describe("Updated custom metric values"),
  customDimension: z
    .array(z.object({ name: z.string(), value: z.string() }))
    .optional()
    .describe("Updated custom dimension values"),
});

export const UpdateConversionsInputSchema = z
  .object({
    agencyId: z.string().min(1).describe("SA360 agency ID"),
    advertiserId: z.string().min(1).describe("SA360 advertiser ID"),
    conversions: z
      .array(ConversionUpdateRowSchema)
      .min(1)
      .max(200)
      .describe("Conversion rows to update (max 200)"),
  })
  .describe("Parameters for updating existing conversions");

export const UpdateConversionsOutputSchema = z
  .object({
    result: z.record(z.any()).describe("API response with updated conversion details"),
    updatedCount: z.number().describe("Number of conversions submitted for update"),
    timestamp: z.string().datetime(),
  })
  .describe("Conversion update result");

type UpdateConversionsInput = z.infer<typeof UpdateConversionsInputSchema>;
type UpdateConversionsOutput = z.infer<typeof UpdateConversionsOutputSchema>;

export async function updateConversionsLogic(
  input: UpdateConversionsInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<UpdateConversionsOutput> {
  const { conversionService } = resolveSessionServices(sdkContext);

  const result = await conversionService.updateConversions(
    input.agencyId,
    input.advertiserId,
    input.conversions,
    context
  );

  return {
    result: result as Record<string, any>,
    updatedCount: input.conversions.length,
    timestamp: new Date().toISOString(),
  };
}

export function updateConversionsResponseFormatter(result: UpdateConversionsOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Updated ${result.updatedCount} conversion(s)\n\n${JSON.stringify(result.result, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const updateConversionsTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: UpdateConversionsInputSchema,
  outputSchema: UpdateConversionsOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: true,
    destructiveHint: false,
    idempotentHint: true,
  },
  inputExamples: [
    {
      label: "Update a conversion's revenue",
      input: {
        agencyId: "12345",
        advertiserId: "67890",
        conversions: [
          {
            conversionId: "conv_abc123",
            conversionTimestamp: "1700000000000",
            revenueMicros: "10000000",
            segmentationType: "FLOODLIGHT",
            floodlightActivityId: "11111",
          },
        ],
      },
    },
    {
      label: "Remove a conversion",
      input: {
        agencyId: "12345",
        advertiserId: "67890",
        conversions: [
          {
            conversionId: "conv_abc123",
            conversionTimestamp: "1700000000000",
            segmentationType: "FLOODLIGHT",
            state: "REMOVED",
          },
        ],
      },
    },
  ],
  logic: updateConversionsLogic,
  responseFormatter: updateConversionsResponseFormatter,
};

// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "sa360_insert_conversions";
const TOOL_TITLE = "Insert SA360 Conversions";
const TOOL_DESCRIPTION = `Insert offline conversions into SA360 via the legacy v2 API (DoubleClick Search).

Upload offline conversion data to attribute conversions to SA360-tracked clicks. Requires a click ID (clickId or gclid) and conversion timestamp for each conversion.

**Important:**
- Uses the legacy v2 API endpoint, not the Reporting API
- Maximum 200 conversions per request
- conversionTimestamp must be epoch milliseconds as a string
- revenueMicros is in the advertiser's currency (1,000,000 = 1 unit)`;

const ConversionRowSchema = z.object({
  clickId: z.string().optional().describe("SA360 click ID"),
  gclid: z.string().optional().describe("Google click ID"),
  conversionTimestamp: z.string().describe("Conversion timestamp (epoch milliseconds as string)"),
  revenueMicros: z.string().optional().describe("Revenue in micros (1,000,000 = 1 currency unit)"),
  currencyCode: z.string().optional().describe("ISO 4217 currency code"),
  quantityMillis: z.string().optional().describe("Conversion quantity in millis (1000 = 1)"),
  segmentationType: z.string().default("FLOODLIGHT").describe("Segment type (default: FLOODLIGHT)"),
  segmentationName: z.string().optional().describe("Floodlight activity name"),
  floodlightActivityId: z.string().optional().describe("Floodlight activity ID"),
  type: z.string().optional().describe("Conversion type (e.g., ACTION, TRANSACTION)"),
  state: z.string().optional().describe("Conversion state (ACTIVE or REMOVED)"),
  customMetric: z
    .array(z.object({ name: z.string(), value: z.number() }))
    .optional()
    .describe("Custom metric values"),
  customDimension: z
    .array(z.object({ name: z.string(), value: z.string() }))
    .optional()
    .describe("Custom dimension values"),
});

export const InsertConversionsInputSchema = z
  .object({
    agencyId: z.string().min(1).describe("SA360 agency ID"),
    advertiserId: z.string().min(1).describe("SA360 advertiser ID"),
    conversions: z
      .array(ConversionRowSchema)
      .min(1)
      .max(200)
      .describe("Conversion rows to insert (max 200)"),
  })
  .describe("Parameters for inserting offline conversions");

export const InsertConversionsOutputSchema = z
  .object({
    result: z.record(z.any()).describe("API response with inserted conversion details"),
    insertedCount: z.number().describe("Number of conversions submitted"),
    timestamp: z.string().datetime(),
  })
  .describe("Conversion insert result");

type InsertConversionsInput = z.infer<typeof InsertConversionsInputSchema>;
type InsertConversionsOutput = z.infer<typeof InsertConversionsOutputSchema>;

export async function insertConversionsLogic(
  input: InsertConversionsInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<InsertConversionsOutput> {
  const { conversionService } = resolveSessionServices(sdkContext);

  const result = await conversionService.insertConversions(
    input.agencyId,
    input.advertiserId,
    input.conversions,
    context
  );

  return {
    result: result as Record<string, any>,
    insertedCount: input.conversions.length,
    timestamp: new Date().toISOString(),
  };
}

export function insertConversionsResponseFormatter(result: InsertConversionsOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Inserted ${result.insertedCount} conversion(s)\n\n${JSON.stringify(result.result, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const insertConversionsTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: InsertConversionsInputSchema,
  outputSchema: InsertConversionsOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: true,
    destructiveHint: false,
    idempotentHint: false,
  },
  inputExamples: [
    {
      label: "Insert a single offline conversion",
      input: {
        agencyId: "12345",
        advertiserId: "67890",
        conversions: [
          {
            gclid: "EAIaIQobChMI...",
            conversionTimestamp: "1700000000000",
            revenueMicros: "5000000",
            currencyCode: "USD",
            segmentationType: "FLOODLIGHT",
            floodlightActivityId: "11111",
            type: "TRANSACTION",
          },
        ],
      },
    },
  ],
  logic: insertConversionsLogic,
  responseFormatter: insertConversionsResponseFormatter,
};
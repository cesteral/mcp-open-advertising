// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type MsAdsEntityType } from "../utils/entity-mapping.js";
import type { RequestContext, McpTextContent, SdkContext } from "@cesteral/shared";

const TOOL_NAME = "msads_adjust_bids";
const TOOL_TITLE = "Adjust Microsoft Ads Bids";
const TOOL_DESCRIPTION = `Batch adjust bids for Microsoft Advertising keywords or ad groups using a safe read-modify-write pattern.

Reads current entities, applies bid changes, and updates. This prevents overwriting other fields.`;

export const AdjustBidsInputSchema = z
  .object({
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Entity type (typically 'keyword' or 'adGroup')"),
    adjustments: z
      .array(
        z.object({
          entityId: z.string().describe("Entity ID"),
          bidField: z.string().describe("Bid field name (e.g., Bid, CpcBid)"),
          newBid: z.number().positive().describe("New bid amount"),
        })
      )
      .min(1)
      .describe("Array of bid adjustments"),
  })
  .describe("Parameters for adjusting bids");

export const AdjustBidsOutputSchema = z
  .object({
    result: z.record(z.any()),
    entityType: z.string(),
    adjustmentCount: z.number(),
    timestamp: z.string().datetime(),
  })
  .describe("Bid adjustment result");

type AdjustBidsInput = z.infer<typeof AdjustBidsInputSchema>;
type AdjustBidsOutput = z.infer<typeof AdjustBidsOutputSchema>;

export async function adjustBidsLogic(
  input: AdjustBidsInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<AdjustBidsOutput> {
  const { msadsService } = resolveSessionServices(sdkContext);

  const result = (await msadsService.adjustBids(
    input.entityType as MsAdsEntityType,
    input.adjustments,
    context
  )) as Record<string, unknown>;

  return {
    result,
    entityType: input.entityType,
    adjustmentCount: input.adjustments.length,
    timestamp: new Date().toISOString(),
  };
}

export function adjustBidsResponseFormatter(result: AdjustBidsOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Adjusted ${result.adjustmentCount} ${result.entityType} bids\n\nResult:\n${JSON.stringify(result.result, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const adjustBidsTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: AdjustBidsInputSchema,
  outputSchema: AdjustBidsOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    idempotentHint: true,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Adjust keyword bids",
      input: {
        entityType: "keyword",
        adjustments: [
          { entityId: "111", bidField: "Bid", newBid: 1.50 },
          { entityId: "222", bidField: "Bid", newBid: 2.00 },
        ],
      },
    },
  ],
  logic: adjustBidsLogic,
  responseFormatter: adjustBidsResponseFormatter,
};
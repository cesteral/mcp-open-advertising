// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { McpTextContent, RequestContext } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "ttd_adjust_bids";
const TOOL_TITLE = "Adjust TTD Ad Group Bids";
const TOOL_DESCRIPTION = `Batch adjust bid CPMs for multiple The Trade Desk ad groups.

For each ad group, the tool:
1. Fetches the current entity (to preserve all existing fields)
2. Updates BaseBidCPM and/or MaxBidCPM in RTBAttributes
3. PUTs the full entity back

This is a safe read-modify-write pattern that avoids accidentally clearing other fields.

**Note:** Concurrent bid adjustments to the same ad group may cause one update to overwrite the other, since TTD does not support optimistic locking. Avoid adjusting the same ad group in parallel.`;

export const AdjustBidsInputSchema = z
  .object({
    adjustments: z
      .array(
        z
          .object({
            adGroupId: z.string().min(1).describe("Ad group ID"),
            baseBidCpm: z.number().positive().optional().describe("New base bid CPM amount"),
            maxBidCpm: z.number().positive().optional().describe("New max bid CPM amount"),
            currencyCode: z.string().optional().describe("Currency code (default: USD)"),
          })
          .refine((adj) => adj.baseBidCpm !== undefined || adj.maxBidCpm !== undefined, {
            message: "At least one of baseBidCpm or maxBidCpm must be provided",
          })
      )
      .min(1)
      .max(50)
      .describe("Array of bid adjustments (max 50)"),
  })
  .describe("Parameters for batch bid adjustment");

const RtbBidSchema = z
  .object({
    Amount: z.union([z.number(), z.string()]).optional(),
    CurrencyCode: z.string().optional(),
  })
  .partial()
  .passthrough();

const AdjustedAdGroupEntitySchema = z
  .object({
    RTBAttributes: z
      .object({
        BaseBidCPM: RtbBidSchema.optional(),
        MaxBidCPM: RtbBidSchema.optional(),
      })
      .partial()
      .passthrough()
      .optional(),
  })
  .passthrough();

type AdjustedAdGroupEntity = z.infer<typeof AdjustedAdGroupEntitySchema>;

export const AdjustBidsOutputSchema = z
  .object({
    totalRequested: z.number(),
    totalSucceeded: z.number(),
    totalFailed: z.number(),
    results: z.array(
      z.object({
        adGroupId: z.string(),
        success: z.boolean(),
        entity: AdjustedAdGroupEntitySchema.optional(),
        error: z.string().optional(),
      })
    ),
    timestamp: z.string().datetime(),
  })
  .describe("Bid adjustment results");

type AdjustBidsInput = z.infer<typeof AdjustBidsInputSchema>;
type AdjustBidsOutput = z.infer<typeof AdjustBidsOutputSchema>;

export async function adjustBidsLogic(
  input: AdjustBidsInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<AdjustBidsOutput> {
  const { ttdService } = resolveSessionServices(sdkContext);

  const { results } = await ttdService.adjustBids(input.adjustments, context);

  const succeeded = results.filter((r) => r.success).length;

  return {
    totalRequested: input.adjustments.length,
    totalSucceeded: succeeded,
    totalFailed: input.adjustments.length - succeeded,
    results: results.map((r) => ({
      adGroupId: r.adGroupId,
      success: r.success,
      entity: r.entity as AdjustedAdGroupEntity | undefined,
      error: r.error,
    })),
    timestamp: new Date().toISOString(),
  };
}

export function adjustBidsResponseFormatter(result: AdjustBidsOutput): McpTextContent[] {
  const summary = result.results
    .map((r) => {
      if (r.success) {
        const rtb = r.entity?.RTBAttributes;
        const base = rtb?.BaseBidCPM?.Amount ?? "?";
        const max = rtb?.MaxBidCPM?.Amount ?? "?";
        return `  [OK] ${r.adGroupId}: base=$${base}, max=$${max}`;
      }
      return `  ✗ ${r.adGroupId}: ${r.error}`;
    })
    .join("\n");

  return [
    {
      type: "text" as const,
      text: `Bid adjustments: ${result.totalSucceeded}/${result.totalRequested} succeeded\n\n${summary}\n\nTimestamp: ${result.timestamp}`,
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
    destructiveHint: true,
    idempotentHint: false,
  },
  inputExamples: [
    {
      label: "Adjust a single ad group bid",
      input: {
        adjustments: [{ adGroupId: "ag789ghi", baseBidCpm: 4.5 }],
      },
    },
    {
      label: "Batch adjust multiple ad groups",
      input: {
        adjustments: [
          { adGroupId: "ag001", baseBidCpm: 3.0, maxBidCpm: 8.0 },
          { adGroupId: "ag002", baseBidCpm: 5.5 },
          { adGroupId: "ag003", maxBidCpm: 12.0, currencyCode: "EUR" },
        ],
      },
    },
  ],
  logic: adjustBidsLogic,
  responseFormatter: adjustBidsResponseFormatter,
};

// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { McpTextContent, RequestContext } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "ttd_bulk_manage_bid_lists";
const TOOL_TITLE = "TTD Bulk Manage Bid Lists";
const TOOL_DESCRIPTION = `Batch get or batch update multiple TTD bid lists in a single call.

### Operations
- **batch_get** — Retrieve up to 50 bid lists by their IDs
- **batch_update** — Update up to 50 bid lists; each item in \`items\` must include a \`BidListId\` field

### Notes
- For **batch_update**, each item in the array must include \`BidListId\` in the payload
- To manage a single bid list (create/get/update), use \`ttd_manage_bid_list\``;

export const BidListBulkInputSchema = z
  .object({
    operation: z.enum(["batch_get", "batch_update"]).describe("Operation to perform"),
    bidListIds: z
      .array(z.string())
      .min(1)
      .max(50)
      .optional()
      .describe("Required for batch_get; array of bid list IDs (max 50)"),
    items: z
      .array(z.record(z.any()))
      .min(1)
      .max(50)
      .optional()
      .describe("Required for batch_update; each must include BidListId (max 50)"),
  })
  .refine(
    (val) => {
      if (val.operation === "batch_get") {
        return Array.isArray(val.bidListIds) && val.bidListIds.length > 0;
      }
      return true;
    },
    { message: "bidListIds is required for batch_get", path: ["bidListIds"] }
  )
  .refine(
    (val) => {
      if (val.operation === "batch_update") {
        return Array.isArray(val.items) && val.items.length > 0;
      }
      return true;
    },
    { message: "items is required for batch_update", path: ["items"] }
  )
  .describe("Parameters for batch get or update of TTD bid lists");

export const BidListBulkOutputSchema = z
  .object({
    operation: z.string().describe("The operation that was performed"),
    count: z.number().describe("Number of bid lists in the result"),
    results: z.array(z.record(z.any())).describe("Array of bid list objects returned by the API"),
    timestamp: z.string().datetime(),
  })
  .describe("Bulk bid list operation result");

type BidListBulkInput = z.infer<typeof BidListBulkInputSchema>;
type BidListBulkOutput = z.infer<typeof BidListBulkOutputSchema>;

export async function bidListBulkLogic(
  input: BidListBulkInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<BidListBulkOutput> {
  const { ttdService } = resolveSessionServices(sdkContext);

  let results: Record<string, unknown>[];

  switch (input.operation) {
    case "batch_get": {
      results = await ttdService.batchGetBidLists(input.bidListIds!, context);
      return {
        operation: "batch_get",
        count: results.length,
        results,
        timestamp: new Date().toISOString(),
      };
    }
    case "batch_update": {
      results = await ttdService.batchUpdateBidLists(input.items!, context);
      return {
        operation: "batch_update",
        count: results.length,
        results,
        timestamp: new Date().toISOString(),
      };
    }
  }
}

export function bidListBulkResponseFormatter(result: BidListBulkOutput): McpTextContent[] {
  const operationLabel = result.operation === "batch_get" ? "Batch get" : "Batch update";
  const lines: string[] = [
    `${operationLabel} successful. ${result.count} bid list(s) returned.`,
    "",
    `Results: ${JSON.stringify(result.results, null, 2)}`,
    `Timestamp: ${result.timestamp}`,
  ];

  return [{ type: "text" as const, text: lines.join("\n") }];
}

export const bulkManageBidListsTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: BidListBulkInputSchema,
  outputSchema: BidListBulkOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    destructiveHint: false,
    idempotentHint: false,
  },
  inputExamples: [
    {
      label: "Batch get multiple bid lists by IDs",
      input: {
        operation: "batch_get",
        bidListIds: ["bl-abc123", "bl-def456", "bl-ghi789"],
      },
    },
    {
      label: "Batch update bid list names",
      input: {
        operation: "batch_update",
        items: [
          {
            BidListId: "bl-abc123",
            AdvertiserId: "adv123abc",
            Name: "Premium Domains - Q2",
            BidListType: "BidAdjustmentByDomain",
            Bids: [{ Domain: "nytimes.com", Adjustment: 1.5 }],
          },
          {
            BidListId: "bl-def456",
            AdvertiserId: "adv123abc",
            Name: "Blocklist - Sensitive Content",
            BidListType: "BlockDomain",
            Bids: [{ Domain: "example-bad.com", Adjustment: 0 }],
          },
        ],
      },
    },
  ],
  logic: bidListBulkLogic,
  responseFormatter: bidListBulkResponseFormatter,
};

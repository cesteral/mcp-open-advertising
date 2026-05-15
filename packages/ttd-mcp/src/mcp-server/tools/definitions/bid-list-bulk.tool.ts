// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { McpTextContent, RequestContext } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "ttd_bulk_manage_bid_lists";
const TOOL_TITLE = "TTD Bulk Manage Bid Lists";
const TOOL_DESCRIPTION = `Batch get or batch update multiple TTD bid lists via GraphQL.

TTD's GraphQL has no native multi-id bid-list query or multi-input update mutation — this tool fans out individual \`bidList(id:)\` queries and \`bidListUpdate(input:)\` mutations in parallel (concurrency=5) and aggregates the per-item results.

### Operations
- **batch_get** — Retrieve up to 50 bid lists by their IDs
- **batch_update** — Update up to 50 bid lists; each item must be a complete \`BidListUpdateInput\`

### Notes
- TTD's \`/v3/bidlist/batch*\` REST endpoints are deprecated; this tool uses GraphQL.
- Per-item failures are surfaced in the response without aborting other items.
- Optional \`selection\` lets you override the GraphQL selection set (default: \`"id name"\`).
- For single bid list operations including create/set/delete, use \`ttd_manage_bid_list\`.`;

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
      .describe("Required for batch_update; each must be a complete BidListUpdateInput (max 50)"),
    selection: z
      .string()
      .optional()
      .describe('GraphQL selection set on returned BidList. Default: "id name"'),
  })
  .refine(
    (val) =>
      val.operation === "batch_get"
        ? Array.isArray(val.bidListIds) && val.bidListIds.length > 0
        : true,
    {
      message: "bidListIds is required for batch_get",
      path: ["bidListIds"],
    }
  )
  .refine(
    (val) =>
      val.operation === "batch_update" ? Array.isArray(val.items) && val.items.length > 0 : true,
    {
      message: "items is required for batch_update",
      path: ["items"],
    }
  )
  .describe("Parameters for bulk bid list operations via GraphQL");

export const BidListBulkOutputSchema = z
  .object({
    operation: z.string(),
    totalItems: z.number(),
    succeeded: z.number(),
    failed: z.number(),
    results: z.array(z.record(z.any())),
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
  const selection = input.selection ?? "id name";
  const ts = new Date().toISOString();

  if (input.operation === "batch_get") {
    const results = await ttdService.batchGetBidLists(input.bidListIds!, context, selection);
    return {
      operation: "batch_get",
      totalItems: results.length,
      succeeded: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results: results as unknown as Record<string, unknown>[],
      timestamp: ts,
    };
  }

  const results = await ttdService.batchUpdateBidLists(input.items!, context, selection);
  return {
    operation: "batch_update",
    totalItems: results.length,
    succeeded: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results: results as unknown as Record<string, unknown>[],
    timestamp: ts,
  };
}

export function bidListBulkResponseFormatter(result: BidListBulkOutput): McpTextContent[] {
  const label = result.operation === "batch_get" ? "Batch get" : "Batch update";
  return [
    {
      type: "text" as const,
      text: [
        `${label} via GraphQL: ${result.succeeded}/${result.totalItems} succeeded, ${result.failed} failed`,
        "",
        `Results: ${JSON.stringify(result.results, null, 2)}`,
        `Timestamp: ${result.timestamp}`,
      ].join("\n"),
    },
  ];
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
      label: "Batch get bid lists by IDs",
      input: {
        operation: "batch_get",
        bidListIds: ["bl-abc123", "bl-def456", "bl-ghi789"],
        selection: "id name adjustmentType",
      },
    },
    {
      label: "Batch incremental updates",
      input: {
        operation: "batch_update",
        items: [
          {
            id: "bl-abc123",
            linesToAdd: [
              { dimensionValues: [{ dimension: "Site", value: "nytimes.com" }], adjustment: 1.5 },
            ],
          },
          {
            id: "bl-def456",
            linesToRemove: [{ dimensionValues: [{ dimension: "Site", value: "example-bad.com" }] }],
          },
        ],
      },
    },
  ],
  logic: bidListBulkLogic,
  responseFormatter: bidListBulkResponseFormatter,
};

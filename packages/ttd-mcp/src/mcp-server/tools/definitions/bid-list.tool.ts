// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { McpTextContent, RequestContext } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";
import { McpError, JsonRpcErrorCode } from "@cesteral/shared";

const TOOL_NAME = "ttd_manage_bid_list";
const TOOL_TITLE = "TTD Manage Bid List";
const TOOL_DESCRIPTION = `Create, retrieve, update, replace, or delete a single TTD bid list via GraphQL.

Bid lists define price floors/ceilings or block rules for specific inventory targets (domains, apps, deal IDs, etc.) and are attached to ad groups or advertisers.

### Operations
- **create** — \`bidListCreate(input: BidListCreateInput!)\` — create a new bid list
- **get** — \`bidList(id: ID!)\` — retrieve a bid list by ID
- **update** — \`bidListUpdate(input: BidListUpdateInput!)\` — incremental change (add/remove specific lines without restating the entire list)
- **set** — \`bidListSet(input: BidListSetInput!)\` — atomic full-replace of all lines with the supplied set
- **delete** — \`bidListDelete(input: BidListDeleteInput!)\` — remove the bid list

### Notes
- TTD's \`/v3/bidlist*\` REST endpoints are deprecated — this tool uses the GraphQL replacements documented in ttd-api-reference-part2.md.
- For \`get\`, the \`bidListId\` you pass is forwarded as the GraphQL \`id\`.
- For \`create\`/\`update\`/\`set\`/\`delete\`, pass the full GraphQL input object via \`data\`. TTD's input shape (not the old REST shape) is what's expected.
- Optional \`selection\` lets you override the GraphQL selection set on the returned \`BidList\` (default: \`"id name"\`).
- To manage multiple bid lists at once, use \`ttd_bulk_manage_bid_lists\`.`;

export const BidListInputSchema = z
  .object({
    operation: z.enum(["create", "get", "update", "set", "delete"]).describe("GraphQL operation"),
    bidListId: z.string().optional().describe("Required for get"),
    data: z
      .record(z.any())
      .optional()
      .describe(
        "GraphQL input object — required for create/update/set/delete. Must match TTD's BidList{Create,Update,Set,Delete}Input shape."
      ),
    selection: z
      .string()
      .optional()
      .describe(
        'GraphQL selection set on the returned BidList. Default: "id name". Use "id name lines { ... }" for richer responses.'
      ),
  })
  .refine(
    (val) =>
      val.operation === "get"
        ? typeof val.bidListId === "string" && val.bidListId.length > 0
        : true,
    { message: "bidListId is required for get", path: ["bidListId"] }
  )
  .refine(
    (val) =>
      val.operation === "create" ||
      val.operation === "update" ||
      val.operation === "set" ||
      val.operation === "delete"
        ? val.data !== undefined && val.data !== null
        : true,
    { message: "data is required for create/update/set/delete", path: ["data"] }
  )
  .describe("Parameters for managing a single TTD bid list via GraphQL");

export const BidListOutputSchema = z
  .object({
    operation: z.string().describe("The operation that was performed"),
    bidListId: z.string().optional().describe("The bid list ID if applicable"),
    result: z.record(z.any()).describe("Raw GraphQL response"),
    timestamp: z.string().datetime(),
  })
  .describe("Bid list operation result");

type BidListInput = z.infer<typeof BidListInputSchema>;
type BidListOutput = z.infer<typeof BidListOutputSchema>;

export async function bidListLogic(
  input: BidListInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<BidListOutput> {
  const { ttdService } = resolveSessionServices(sdkContext);
  const selection = input.selection ?? "id name";
  const now = () => new Date().toISOString();

  switch (input.operation) {
    case "create": {
      if (!input.data)
        throw new McpError(JsonRpcErrorCode.InvalidParams, "data is required for create");
      const result = (await ttdService.createBidList(input.data, context, selection)) as Record<
        string,
        unknown
      >;
      return { operation: "create", result, timestamp: now() };
    }
    case "get": {
      const result = (await ttdService.getBidList(input.bidListId!, context, selection)) as Record<
        string,
        unknown
      >;
      return { operation: "get", bidListId: input.bidListId, result, timestamp: now() };
    }
    case "update": {
      if (!input.data)
        throw new McpError(JsonRpcErrorCode.InvalidParams, "data is required for update");
      const result = (await ttdService.updateBidList(input.data, context, selection)) as Record<
        string,
        unknown
      >;
      return { operation: "update", bidListId: input.bidListId, result, timestamp: now() };
    }
    case "set": {
      if (!input.data)
        throw new McpError(JsonRpcErrorCode.InvalidParams, "data is required for set");
      const result = (await ttdService.setBidList(input.data, context, selection)) as Record<
        string,
        unknown
      >;
      return { operation: "set", bidListId: input.bidListId, result, timestamp: now() };
    }
    case "delete": {
      if (!input.data)
        throw new McpError(JsonRpcErrorCode.InvalidParams, "data is required for delete");
      const result = (await ttdService.deleteBidList(input.data, context)) as Record<
        string,
        unknown
      >;
      return { operation: "delete", bidListId: input.bidListId, result, timestamp: now() };
    }
  }
}

export function bidListResponseFormatter(result: BidListOutput): McpTextContent[] {
  const lines: string[] = [`Bid list ${result.operation} via GraphQL.`, ""];
  if (result.bidListId) lines.push(`Bid List ID: ${result.bidListId}`);
  lines.push(`Result: ${JSON.stringify(result.result, null, 2)}`);
  lines.push(`Timestamp: ${result.timestamp}`);
  return [{ type: "text" as const, text: lines.join("\n") }];
}

export const manageBidListTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: BidListInputSchema,
  outputSchema: BidListOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    destructiveHint: false,
    idempotentHint: false,
  },
  inputExamples: [
    {
      label: "Create a bid list",
      input: {
        operation: "create",
        data: {
          owner: { type: "Advertiser", id: "adv123abc" },
          name: "Premium News Domains",
          adjustmentType: "BidMultiplier",
          lines: [
            { dimensionValues: [{ dimension: "Site", value: "nytimes.com" }], adjustment: 1.5 },
            { dimensionValues: [{ dimension: "Site", value: "wsj.com" }], adjustment: 1.3 },
          ],
        },
      },
    },
    {
      label: "Get a bid list by ID",
      input: {
        operation: "get",
        bidListId: "bl-abc123def",
        selection:
          "id name adjustmentType lines { dimensionValues { dimension value } adjustment }",
      },
    },
    {
      label: "Atomically replace all lines (bidListSet)",
      input: {
        operation: "set",
        data: {
          id: "bl-abc123def",
          lines: [
            { dimensionValues: [{ dimension: "Site", value: "nytimes.com" }], adjustment: 1.8 },
          ],
        },
      },
    },
    {
      label: "Incrementally add/remove lines (bidListUpdate)",
      input: {
        operation: "update",
        data: {
          id: "bl-abc123def",
          linesToAdd: [
            { dimensionValues: [{ dimension: "Site", value: "ft.com" }], adjustment: 1.4 },
          ],
          linesToRemove: [{ dimensionValues: [{ dimension: "Site", value: "wsj.com" }] }],
        },
      },
    },
    {
      label: "Delete a bid list",
      input: {
        operation: "delete",
        data: { id: "bl-abc123def" },
      },
    },
  ],
  logic: bidListLogic,
  responseFormatter: bidListResponseFormatter,
};

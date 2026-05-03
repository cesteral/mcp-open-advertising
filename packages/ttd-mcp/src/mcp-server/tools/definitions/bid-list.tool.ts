// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { McpTextContent, RequestContext } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";
import { McpError, JsonRpcErrorCode } from "@cesteral/shared";

const TOOL_NAME = "ttd_manage_bid_list";
const TOOL_TITLE = "TTD Manage Bid List";
const TOOL_DESCRIPTION = `Create, retrieve, or update a single TTD bid list.

Bid lists define price floors or ceilings for specific inventory targets (domains, apps, deal IDs, etc.) and are attached to ad groups.

### Operations
- **create** — Create a new bid list with the provided payload
- **get** — Retrieve a bid list by its ID
- **update** — Replace a bid list (full payload required; BidListId is merged from \`bidListId\` parameter)

### Notes
- For **update**, the \`BidListId\` field is automatically merged into the body from the \`bidListId\` parameter
- To manage multiple bid lists at once, use \`ttd_bulk_manage_bid_lists\``;

export const BidListInputSchema = z
  .object({
    operation: z.enum(["create", "get", "update"]).describe("Operation to perform"),
    bidListId: z.string().optional().describe("Required for get and update operations"),
    data: z.record(z.any()).optional().describe("Bid list payload for create and update"),
  })
  .refine(
    (val) => {
      if (val.operation === "get" || val.operation === "update") {
        return typeof val.bidListId === "string" && val.bidListId.length > 0;
      }
      return true;
    },
    { message: "bidListId is required for get and update", path: ["bidListId"] }
  )
  .refine(
    (val) => {
      if (val.operation === "create" || val.operation === "update") {
        return val.data !== undefined && val.data !== null;
      }
      return true;
    },
    { message: "data is required for create and update", path: ["data"] }
  )
  .describe("Parameters for managing a single TTD bid list");

export const BidListOutputSchema = z
  .object({
    operation: z.string().describe("The operation that was performed"),
    bidListId: z.string().optional().describe("The bid list ID if applicable"),
    result: z.record(z.any()).describe("Bid list data returned by the API"),
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

  let result: Record<string, unknown>;

  switch (input.operation) {
    case "create": {
      if (!input.data) {
        throw new McpError(JsonRpcErrorCode.InvalidParams, "data is required for create operation");
      }
      result = await ttdService.createBidList(input.data, context);
      return {
        operation: "create",
        result,
        timestamp: new Date().toISOString(),
      };
    }
    case "get": {
      result = await ttdService.getBidList(input.bidListId!, context);
      return {
        operation: "get",
        bidListId: input.bidListId,
        result,
        timestamp: new Date().toISOString(),
      };
    }
    case "update": {
      if (!input.data) {
        throw new McpError(JsonRpcErrorCode.InvalidParams, "data is required for update operation");
      }
      const payload = { ...input.data, BidListId: input.bidListId };
      result = await ttdService.updateBidList(payload, context);
      return {
        operation: "update",
        bidListId: input.bidListId,
        result,
        timestamp: new Date().toISOString(),
      };
    }
  }
}

export function bidListResponseFormatter(result: BidListOutput): McpTextContent[] {
  const lines: string[] = [`Bid list ${result.operation} successful.`, ""];

  if (result.bidListId) {
    lines.push(`Bid List ID: ${result.bidListId}`);
  }

  const bidListId = result.result["BidListId"] as string | undefined;
  if (bidListId && bidListId !== result.bidListId) {
    lines.push(`Bid List ID: ${bidListId}`);
  }

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
      label: "Create a bid list targeting specific domains",
      input: {
        operation: "create",
        data: {
          AdvertiserId: "adv123abc",
          Name: "Premium News Domains",
          BidListType: "BidAdjustmentByDomain",
          Bids: [
            { Domain: "nytimes.com", Adjustment: 1.5 },
            { Domain: "wsj.com", Adjustment: 1.3 },
          ],
        },
      },
    },
    {
      label: "Get a bid list by ID",
      input: {
        operation: "get",
        bidListId: "bl-abc123def",
      },
    },
    {
      label: "Update a bid list's name and bids",
      input: {
        operation: "update",
        bidListId: "bl-abc123def",
        data: {
          AdvertiserId: "adv123abc",
          Name: "Premium News Domains - Updated",
          BidListType: "BidAdjustmentByDomain",
          Bids: [
            { Domain: "nytimes.com", Adjustment: 1.8 },
            { Domain: "wsj.com", Adjustment: 1.5 },
          ],
        },
      },
    },
  ],
  logic: bidListLogic,
  responseFormatter: bidListResponseFormatter,
};

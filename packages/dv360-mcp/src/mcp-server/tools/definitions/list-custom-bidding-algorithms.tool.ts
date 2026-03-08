import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "dv360_list_custom_bidding_algorithms";
const TOOL_TITLE = "List Custom Bidding Algorithms";

const TOOL_DESCRIPTION = `List custom bidding algorithms accessible to a partner or advertiser (Tier 2 workflow tool).

**Access Patterns:**
- By Partner ID: Lists algorithms owned by the partner + shared with partner's advertisers
- By Advertiser ID: Lists algorithms owned by or shared with the advertiser

**Algorithm Types:**
- SCRIPT_BASED: Custom JavaScript-like bidding logic
- RULE_BASED: Declarative rules (restricted to allowlisted customers)

**Model Readiness States:**
- ACTIVE: Algorithm is trained and ready
- INSUFFICIENT_DATA: Not enough data to train
- TRAINING: Model is being trained
- NO_VALID_SCRIPT: No accepted script uploaded
- EVALUATION_FAILURE: Script evaluation failed

**Filter Examples:**
- entityStatus="ENTITY_STATUS_ACTIVE"
- customBiddingAlgorithmType="SCRIPT_BASED"`;

/**
 * Input schema for list custom bidding algorithms tool
 */
export const ListCustomBiddingAlgorithmsInputSchema = z
  .object({
    partnerId: z
      .string()
      .optional()
      .describe("Partner ID to list algorithms for. Either partnerId or advertiserId required."),
    advertiserId: z
      .string()
      .optional()
      .describe("Advertiser ID to list algorithms for. Either partnerId or advertiserId required."),
    filter: z
      .string()
      .optional()
      .describe('Optional filter expression (e.g., entityStatus="ENTITY_STATUS_ACTIVE")'),
    pageSize: z
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .describe("Number of results per page (default: 100, max: 200)"),
    pageToken: z.string().optional().describe("Page token for pagination"),
  })
  .refine((input) => input.partnerId || input.advertiserId, {
    message: "Either partnerId or advertiserId must be provided",
  })
  .describe("Parameters for listing custom bidding algorithms");

/**
 * Output schema for list custom bidding algorithms tool
 */
export const ListCustomBiddingAlgorithmsOutputSchema = z
  .object({
    algorithms: z
      .array(
        z.object({
          customBiddingAlgorithmId: z.string(),
          displayName: z.string(),
          customBiddingAlgorithmType: z.string(),
          entityStatus: z.string(),
          advertiserId: z.string().optional(),
          partnerId: z.string().optional(),
          sharedAdvertiserIds: z.array(z.string()).optional(),
          modelDetails: z
            .array(
              z.object({
                advertiserId: z.string(),
                readinessState: z.string(),
                suspensionState: z.string().optional(),
              })
            )
            .optional(),
        })
      )
      .describe("List of algorithms"),
    totalCount: z.number(),
    nextPageToken: z.string().optional(),
    has_more: z.boolean().describe("Whether more results are available via pagination"),
    timestamp: z.string().datetime(),
  })
  .describe("List custom bidding algorithms result");

type ListCustomBiddingAlgorithmsInput = z.infer<typeof ListCustomBiddingAlgorithmsInputSchema>;
type ListCustomBiddingAlgorithmsOutput = z.infer<typeof ListCustomBiddingAlgorithmsOutputSchema>;

/**
 * List custom bidding algorithms tool logic
 */
export async function listCustomBiddingAlgorithmsLogic(
  input: ListCustomBiddingAlgorithmsInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<ListCustomBiddingAlgorithmsOutput> {
  const { dv360Service } = resolveSessionServices(sdkContext);

  // Validate that at least one ID is provided
  if (!input.partnerId && !input.advertiserId) {
    throw new Error("Either partnerId or advertiserId must be provided");
  }

  // Build IDs and filter for the query
  const ids: Record<string, string> = {};

  // Build filter expression
  let filter = input.filter || "";

  if (input.partnerId) {
    // For partner queries, add partnerId filter
    const partnerFilter = `partnerId="${input.partnerId}"`;
    filter = filter ? `${filter} AND ${partnerFilter}` : partnerFilter;
  }

  if (input.advertiserId) {
    // For advertiser queries, add advertiserId filter
    const advertiserFilter = `advertiserId="${input.advertiserId}"`;
    filter = filter ? `${filter} AND ${advertiserFilter}` : advertiserFilter;
  }

  // Use listEntities which handles the API call
  const { entities, nextPageToken } = await dv360Service.listEntities(
    "customBiddingAlgorithm",
    ids,
    filter,
    input.pageToken,
    input.pageSize || 100,
    context
  );

  const algorithms = (entities as any[]).map((alg) => ({
    customBiddingAlgorithmId: alg.customBiddingAlgorithmId,
    displayName: alg.displayName,
    customBiddingAlgorithmType: alg.customBiddingAlgorithmType,
    entityStatus: alg.entityStatus,
    advertiserId: alg.advertiserId,
    partnerId: alg.partnerId,
    sharedAdvertiserIds: alg.sharedAdvertiserIds,
    modelDetails: alg.modelDetails?.map((md: any) => ({
      advertiserId: md.advertiserId,
      readinessState: md.readinessState,
      suspensionState: md.suspensionState,
    })),
  }));

  return {
    algorithms,
    totalCount: algorithms.length,
    nextPageToken,
    has_more: !!nextPageToken,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Format response for MCP client
 */
export function listCustomBiddingAlgorithmsResponseFormatter(
  result: ListCustomBiddingAlgorithmsOutput
): any {
  let message = `**Custom Bidding Algorithms (${result.totalCount}):**\n\n`;

  if (result.algorithms.length === 0) {
    message += `No algorithms found.\n`;
  } else {
    for (const alg of result.algorithms) {
      const ownerInfo = alg.advertiserId
        ? `Advertiser: ${alg.advertiserId}`
        : `Partner: ${alg.partnerId}`;

      message += `**${alg.displayName}** (${alg.customBiddingAlgorithmId})\n`;
      message += `  - Type: ${alg.customBiddingAlgorithmType}\n`;
      message += `  - Status: ${alg.entityStatus}\n`;
      message += `  - Owner: ${ownerInfo}\n`;

      if (alg.sharedAdvertiserIds?.length) {
        message += `  - Shared with: ${alg.sharedAdvertiserIds.join(", ")}\n`;
      }

      if (alg.modelDetails?.length) {
        message += `  - Model States:\n`;
        for (const md of alg.modelDetails) {
          const suspension = md.suspensionState ? ` (${md.suspensionState})` : "";
          message += `    - Advertiser ${md.advertiserId}: ${md.readinessState}${suspension}\n`;
        }
      }

      message += `\n`;
    }
  }

  if (result.nextPageToken) {
    message += `\n> More results available. Use pageToken: "${result.nextPageToken}" to fetch next page.\n`;
  }

  message += `\nTimestamp: ${result.timestamp}`;

  return [
    {
      type: "text" as const,
      text: message,
    },
  ];
}

/**
 * List Custom Bidding Algorithms Tool Definition
 */
export const listCustomBiddingAlgorithmsTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: ListCustomBiddingAlgorithmsInputSchema,
  outputSchema: ListCustomBiddingAlgorithmsOutputSchema,
  inputExamples: [
    {
      label: "List all algorithms for an advertiser",
      input: {
        advertiserId: "1234567",
        pageSize: 50,
      },
    },
    {
      label: "List active script-based algorithms for a partner",
      input: {
        partnerId: "9876543",
        filter: 'entityStatus="ENTITY_STATUS_ACTIVE" AND customBiddingAlgorithmType="SCRIPT_BASED"',
        pageSize: 100,
      },
    },
  ],
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
    idempotentHint: true,
  },
  logic: listCustomBiddingAlgorithmsLogic,
  responseFormatter: listCustomBiddingAlgorithmsResponseFormatter,
};

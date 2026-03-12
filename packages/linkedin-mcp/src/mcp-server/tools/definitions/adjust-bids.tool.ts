import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "linkedin_adjust_bids";
const TOOL_TITLE = "LinkedIn Ads Bid Adjustment";
const TOOL_DESCRIPTION = `Batch adjust campaign bid amounts.

Updates the \`unitCost\` (bid) for each campaign via PATCH.

**bid structure:** \`{ "amount": "10.00", "currencyCode": "USD" }\`

**Gotchas:**
- Only applies to campaigns with manual bidding (bidType: CPM, CPC, etc.).
- LOWEST_COST campaigns may ignore unitCost.
- Each adjustment consumes 3x rate limit tokens (write operation).
- Max 50 adjustments per call.`;

export const AdjustBidsInputSchema = z
  .object({
    adjustments: z
      .array(
        z.object({
          campaignUrn: z
            .string()
            .min(1)
            .describe("The campaign URN to adjust (e.g., urn:li:sponsoredCampaign:123)"),
          amount: z
            .string()
            .describe("New bid amount as a decimal string (e.g., \"10.00\")"),
          currencyCode: z
            .string()
            .length(3)
            .describe("ISO 4217 currency code (e.g., USD, EUR, GBP)"),
        })
      )
      .min(1)
      .max(50)
      .describe("Bid adjustments to apply (max 50)"),
    reason: z
      .string()
      .optional()
      .describe("Optional reason for the bid adjustment"),
  })
  .describe("Parameters for batch bid adjustment on LinkedIn campaigns");

export const AdjustBidsOutputSchema = z
  .object({
    totalRequested: z.number(),
    totalSucceeded: z.number(),
    totalFailed: z.number(),
    results: z.array(
      z.object({
        campaignUrn: z.string(),
        success: z.boolean(),
        newAmount: z.string().optional(),
        currencyCode: z.string().optional(),
        error: z.string().optional(),
      })
    ),
    timestamp: z.string().datetime(),
  })
  .describe("Bid adjustment results");

type AdjustBidsInput = z.infer<typeof AdjustBidsInputSchema>;
type AdjustBidsOutput = z.infer<typeof AdjustBidsOutputSchema>;

interface AdjustBidsResult {
  campaignUrn: string;
  success: boolean;
  newAmount?: string;
  currencyCode?: string;
  error?: string;
}

export async function adjustBidsLogic(
  input: AdjustBidsInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<AdjustBidsOutput> {
  const { linkedInService } = resolveSessionServices(sdkContext);

  const results: AdjustBidsResult[] = [];

  // Process adjustments sequentially to respect rate limits
  for (const adjustment of input.adjustments) {
    try {
      await linkedInService.adjustBids(
        [
          {
            campaignUrn: adjustment.campaignUrn,
            bidAmount: {
              amount: adjustment.amount,
              currencyCode: adjustment.currencyCode,
            },
          },
        ],
        context
      );

      results.push({
        campaignUrn: adjustment.campaignUrn,
        success: true,
        newAmount: adjustment.amount,
        currencyCode: adjustment.currencyCode,
      });
    } catch (error) {
      results.push({
        campaignUrn: adjustment.campaignUrn,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const totalSucceeded = results.filter((r) => r.success).length;

  return {
    totalRequested: input.adjustments.length,
    totalSucceeded,
    totalFailed: input.adjustments.length - totalSucceeded,
    results,
    timestamp: new Date().toISOString(),
  };
}

export function adjustBidsResponseFormatter(result: AdjustBidsOutput): McpTextContent[] {
  const lines: string[] = [];

  lines.push(
    `Bid adjustments: ${result.totalSucceeded}/${result.totalRequested} succeeded, ${result.totalFailed} failed`
  );
  lines.push("");

  for (const r of result.results) {
    if (r.success) {
      lines.push(`  ${r.campaignUrn}: ${r.newAmount} ${r.currencyCode}`);
    } else {
      lines.push(`  ${r.campaignUrn}: FAILED - ${r.error}`);
    }
  }

  lines.push("");
  lines.push(`Timestamp: ${result.timestamp}`);

  return [
    {
      type: "text" as const,
      text: lines.join("\n"),
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
    openWorldHint: true,
    idempotentHint: true,
    destructiveHint: true,
  },
  inputExamples: [
    {
      label: "Single bid adjustment",
      input: {
        adjustments: [
          {
            campaignUrn: "urn:li:sponsoredCampaign:123456789",
            amount: "12.00",
            currencyCode: "USD",
          },
        ],
      },
    },
    {
      label: "Multiple bid adjustments",
      input: {
        adjustments: [
          {
            campaignUrn: "urn:li:sponsoredCampaign:111111111",
            amount: "8.50",
            currencyCode: "USD",
          },
          {
            campaignUrn: "urn:li:sponsoredCampaign:222222222",
            amount: "15.00",
            currencyCode: "USD",
          },
        ],
        reason: "Increase bids to improve delivery",
      },
    },
  ],
  logic: adjustBidsLogic,
  responseFormatter: adjustBidsResponseFormatter,
};

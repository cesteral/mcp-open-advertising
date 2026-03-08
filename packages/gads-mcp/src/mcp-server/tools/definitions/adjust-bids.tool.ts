import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "gads_adjust_bids";
const TOOL_TITLE = "Google Ads Bid Adjustment";
const TOOL_DESCRIPTION = `Batch adjust ad group bids with safe read-modify-write pattern.

For each ad group, the tool:
1. Reads the current ad group to capture previous bid values
2. Applies the new CPC and/or CPM bid amounts
3. Writes the update via the :mutate endpoint with a targeted updateMask

Returns both previous and new values for audit trail.

**Bid amounts are in micros** (1,000,000 = $1.00 USD). For example:
- $1.50 CPC = "1500000"
- $5.00 CPM = "5000000"

Up to 50 ad groups can be adjusted in a single call.

**Note:** Uses a read-modify-write pattern. Concurrent bid adjustments to the same ad group may cause one update to overwrite the other. Avoid adjusting the same ad group in parallel.`;

export const AdjustBidsInputSchema = z
  .object({
    customerId: z
      .string()
      .min(1)
      .describe("Google Ads customer ID (no dashes)"),
    adjustments: z
      .array(
        z
          .object({
            adGroupId: z.string().min(1).describe("Ad group ID"),
            cpcBidMicros: z
              .string()
              .optional()
              .describe("New CPC bid in micros (1,000,000 = $1.00)"),
            cpmBidMicros: z
              .string()
              .optional()
              .describe("New CPM bid in micros (1,000,000 = $1.00)"),
          })
          .superRefine((adj, ctx) => {
            if (adj.cpcBidMicros === undefined && adj.cpmBidMicros === undefined) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "At least one of cpcBidMicros or cpmBidMicros must be provided",
              });
            }
          })
      )
      .min(1)
      .max(50)
      .describe("Array of bid adjustments (max 50)"),
    reason: z
      .string()
      .optional()
      .describe("Optional reason for the bid adjustment (for audit trail)"),
  })
  .describe("Parameters for batch Google Ads bid adjustment");

export const AdjustBidsOutputSchema = z
  .object({
    totalRequested: z.number(),
    totalSucceeded: z.number(),
    totalFailed: z.number(),
    results: z.array(
      z.object({
        adGroupId: z.string(),
        adGroupName: z.string().optional(),
        success: z.boolean(),
        previousCpcBidMicros: z.string().optional(),
        previousCpmBidMicros: z.string().optional(),
        newCpcBidMicros: z.string().optional(),
        newCpmBidMicros: z.string().optional(),
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
  const { gadsService } = resolveSessionServices(sdkContext);

  const { results } = await gadsService.adjustBids(
    input.customerId,
    input.adjustments,
    context
  );

  const succeeded = results.filter((r) => r.success).length;

  return {
    totalRequested: input.adjustments.length,
    totalSucceeded: succeeded,
    totalFailed: input.adjustments.length - succeeded,
    results: results.map((r) => ({
      adGroupId: r.adGroupId,
      adGroupName: r.adGroupName,
      success: r.success,
      previousCpcBidMicros: r.previousCpcBidMicros,
      previousCpmBidMicros: r.previousCpmBidMicros,
      newCpcBidMicros: r.newCpcBidMicros,
      newCpmBidMicros: r.newCpmBidMicros,
      error: r.error,
    })),
    timestamp: new Date().toISOString(),
  };
}

function formatMicrosAsDollars(micros?: string): string {
  if (!micros) return "n/a";
  const num = Number(micros);
  if (isNaN(num)) return micros;
  return `$${(num / 1_000_000).toFixed(2)}`;
}

export function adjustBidsResponseFormatter(result: AdjustBidsOutput): any {
  const lines = result.results.map((r) => {
    if (r.success) {
      const parts: string[] = [];
      const name = r.adGroupName ? ` (${r.adGroupName})` : "";

      if (r.newCpcBidMicros !== undefined) {
        parts.push(
          `CPC ${formatMicrosAsDollars(r.previousCpcBidMicros)} -> ${formatMicrosAsDollars(r.newCpcBidMicros)}`
        );
      }

      if (r.newCpmBidMicros !== undefined) {
        parts.push(
          `CPM ${formatMicrosAsDollars(r.previousCpmBidMicros)} -> ${formatMicrosAsDollars(r.newCpmBidMicros)}`
        );
      }

      return `  + ${r.adGroupId}${name}: ${parts.join(", ")}`;
    }
    return `  x ${r.adGroupId}: ${r.error}`;
  });

  const summary = `Bid adjustments: ${result.totalSucceeded}/${result.totalRequested} succeeded, ${result.totalFailed} failed`;

  return [
    {
      type: "text" as const,
      text: `${summary}\n\n${lines.join("\n")}\n\nNote: Amounts in micros (1,000,000 = $1.00 USD)\nTimestamp: ${result.timestamp}`,
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
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputExamples: [
    {
      label: "Single CPC adjustment",
      input: {
        customerId: "1234567890",
        adjustments: [
          { adGroupId: "111222333", cpcBidMicros: "1500000" },
        ],
      },
    },
    {
      label: "Multiple adjustments with mixed bid types",
      input: {
        customerId: "1234567890",
        adjustments: [
          { adGroupId: "111", cpcBidMicros: "2000000" },
          { adGroupId: "222", cpmBidMicros: "5000000" },
        ],
        reason: "Increase bids to improve delivery pacing",
      },
    },
  ],
  logic: adjustBidsLogic,
  responseFormatter: adjustBidsResponseFormatter,
};

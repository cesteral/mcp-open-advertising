// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Shared factory for `<platform>_get_pacing_status` tools.
 *
 * Twelve servers shipped the same ~205-line client-side pacing calculator,
 * differing only in the account-id field name, a platform-specific description
 * and the example ids. This factory owns everything else: the schemas, the
 * `calculatePacingStatus` call, the output shape and the text formatter.
 *
 * Servers whose pacing tool is NOT a pure calculator over caller-supplied
 * numbers (dbm-mcp fetches delivery from the Bid Manager API and takes no
 * `spendToDate`) keep their own hand-written tool.
 *
 * Everything that reaches `tools/list` (name, title, description, input and
 * output schema, examples) is part of the tool-search ranking evals and the
 * contract surface, so each of those is a caller-controlled option rather than
 * something the factory rewords.
 */

import { z } from "zod";
import { calculatePacingStatus } from "../reporting/pacing.js";
import { NO_UNTRUSTED_CONTENT } from "./untrusted-content.js";
import type { SdkContext, ToolDefinition } from "../../types/tool-types.js";
import type { McpTextContent } from "./tool-handler-factory.js";
import type { RequestContext } from "../observability/request-context.js";

const TOOL_TITLE = "Calculate Campaign Pacing (Client-Side)";

const DATE_FORMAT_MESSAGE = "Date must be in YYYY-MM-DD format";

const PACING_STATUSES = ["ON_PACE", "AHEAD", "BEHIND", "SEVERELY_BEHIND"] as const;

/** The fields every pacing tool takes, besides its platform's account-id field. */
interface PacingInputFields {
  campaignId: string;
  spendToDate: number;
  budgetTotal: number;
  flightStartDate: string;
  flightEndDate: string;
  currency: string;
}

/** The fields every pacing tool returns, besides its platform's account-id field. */
interface PacingOutputFields {
  campaignId: string;
  budget: { total: number; spent: number; remaining: number; currency: string };
  flight: {
    startDate: string;
    endDate: string;
    daysElapsed: number;
    daysRemaining: number;
    totalDays: number;
  };
  pacing: {
    expectedSpendPercent: number;
    actualSpendPercent: number;
    pacingRatio: number;
    status: (typeof PACING_STATUSES)[number];
    projectedEndSpend: number;
  };
  timestamp: string;
}

/** Validated input of a pacing tool whose account-id field is `K`. */
export type PacingToolInput<K extends string> = Record<K, string> & PacingInputFields;

/** Result of a pacing tool whose account-id field is `K`. */
export type PacingToolOutput<K extends string> = Record<K, string> & PacingOutputFields;

/**
 * Raw (pre-parse) input: `currency` has a default, so it is optional until the
 * schema has run.
 */
type PacingToolRawInput<K extends string> = Record<K, string> &
  Omit<PacingInputFields, "currency"> & { currency?: string | undefined };

export interface PacingToolOptions<K extends string> {
  /** Platform slug; the tool is named `${platform}_get_pacing_status`. */
  platform: string;
  /**
   * The platform's account-id input and its schema (name, `.min(1)` and
   * `.describe(...)` are all part of the published schema, so the server
   * supplies the whole string schema).
   */
  accountId: { field: K; schema: z.ZodString };
  /** Schema for the `campaignId` input (same reasoning as `accountId.schema`). */
  campaignIdSchema: z.ZodString;
  /** How the description names the API it does not call, e.g. `the TikTok API`. */
  platformApi: string;
  /**
   * The platform-specific half of the description: which tools to call to
   * populate spend, budget and flight dates, plus any unit caveat.
   */
  populateGuidance: string;
  /** Overrides for the default `spendToDate` / `budgetTotal` descriptions. */
  descriptions?: { spendToDate?: string; budgetTotal?: string };
  /** Account and campaign ids for the two published input examples. */
  exampleIds: readonly [
    { accountId: string; campaignId: string },
    { accountId: string; campaignId: string },
  ];
}

export type PacingTool<K extends string> = Omit<
  ToolDefinition<
    z.ZodType<PacingToolInput<K>, z.ZodTypeDef, PacingToolRawInput<K>>,
    z.ZodType<PacingToolOutput<K>>
  >,
  "responseFormatter"
> & {
  responseFormatter: (result: PacingToolOutput<K>) => McpTextContent[];
};

/**
 * Build a `<platform>_get_pacing_status` tool: a client-side calculator over
 * caller-supplied budget, spend and flight dates. It never calls the platform.
 */
export function createPacingTool<K extends string>(opts: PacingToolOptions<K>): PacingTool<K> {
  const { field } = opts.accountId;

  const flightDate = (description: string) =>
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, DATE_FORMAT_MESSAGE)
      .describe(description);

  // Key order is the published property order: account id first.
  const inputSchema = z
    .object({
      [field]: opts.accountId.schema,
      campaignId: opts.campaignIdSchema,
      spendToDate: z
        .number()
        .min(0)
        .describe(opts.descriptions?.spendToDate ?? "Total spend to date in account currency"),
      budgetTotal: z
        .number()
        .min(0)
        .describe(opts.descriptions?.budgetTotal ?? "Total campaign budget in account currency"),
      flightStartDate: flightDate("Flight start date (YYYY-MM-DD)"),
      flightEndDate: flightDate("Flight end date (YYYY-MM-DD)"),
      currency: z.string().default("USD").describe("Currency code (default: USD)"),
    })
    .describe("Parameters for checking campaign pacing status") as unknown as z.ZodType<
    PacingToolInput<K>,
    z.ZodTypeDef,
    PacingToolRawInput<K>
  >;

  const outputSchema = z
    .object({
      [field]: z.string(),
      campaignId: z.string(),
      budget: z.object({
        total: z.number(),
        spent: z.number(),
        remaining: z.number(),
        currency: z.string(),
      }),
      flight: z.object({
        startDate: z.string(),
        endDate: z.string(),
        daysElapsed: z.number(),
        daysRemaining: z.number(),
        totalDays: z.number(),
      }),
      pacing: z.object({
        expectedSpendPercent: z.number(),
        actualSpendPercent: z.number(),
        pacingRatio: z.number().describe("actual / expected (1.0 = on pace)"),
        status: z.enum(PACING_STATUSES),
        projectedEndSpend: z.number(),
      }),
      timestamp: z.string().datetime(),
    })
    .describe("Campaign pacing status result") as unknown as z.ZodType<PacingToolOutput<K>>;

  async function logic(
    input: PacingToolInput<K>,
    _context: RequestContext,
    _sdkContext?: SdkContext
  ): Promise<PacingToolOutput<K>> {
    const pacingStatus = calculatePacingStatus({
      spendToDate: input.spendToDate,
      budgetTotal: input.budgetTotal,
      flightStartDate: input.flightStartDate,
      flightEndDate: input.flightEndDate,
    });

    return {
      [field]: input[field],
      campaignId: input.campaignId,
      budget: {
        total: input.budgetTotal,
        spent: input.spendToDate,
        remaining: Math.max(0, input.budgetTotal - input.spendToDate),
        currency: input.currency,
      },
      flight: {
        startDate: input.flightStartDate,
        endDate: input.flightEndDate,
        daysElapsed: pacingStatus.daysElapsed,
        daysRemaining: pacingStatus.daysRemaining,
        totalDays: pacingStatus.totalDays,
      },
      pacing: {
        expectedSpendPercent: pacingStatus.expectedSpendPercent,
        actualSpendPercent: pacingStatus.actualSpendPercent,
        pacingRatio: pacingStatus.pacingRatio,
        status: pacingStatus.status,
        projectedEndSpend: pacingStatus.projectedEndSpend,
      },
      timestamp: new Date().toISOString(),
    } as PacingToolOutput<K>;
  }

  return {
    name: `${opts.platform}_get_pacing_status`,
    title: TOOL_TITLE,
    description:
      `Client-side pacing calculator — does NOT call ${opts.platformApi}. ` +
      "Computes actual vs expected delivery given caller-supplied budget, spend-to-date, and flight dates. " +
      opts.populateGuidance,
    inputSchema,
    outputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
      idempotentHint: true,
    },
    inputExamples: [
      {
        label: "Check pacing for a standard monthly campaign",
        input: {
          [field]: opts.exampleIds[0].accountId,
          campaignId: opts.exampleIds[0].campaignId,
          spendToDate: 18000,
          budgetTotal: 50000,
          flightStartDate: "2026-03-01",
          flightEndDate: "2026-03-31",
          currency: "USD",
        },
      },
      {
        label: "Check pacing for a short-burst campaign in GBP",
        input: {
          [field]: opts.exampleIds[1].accountId,
          campaignId: opts.exampleIds[1].campaignId,
          spendToDate: 4200,
          budgetTotal: 10000,
          flightStartDate: "2026-03-15",
          flightEndDate: "2026-03-21",
          currency: "GBP",
        },
      },
    ],
    logic,
    responseFormatter: formatPacingStatus,
    // Purely client-side arithmetic over caller-supplied numbers and dates: the
    // ids and currency are the caller's own input, the rest are numbers and a
    // computed enum. No platform free text, no platform call.
    untrustedContent: NO_UNTRUSTED_CONTENT,
  };
}

function formatPacingStatus(result: PacingToolOutput<string>): McpTextContent[] {
  // Amounts are in the caller's `currency`, not always dollars: print the ISO
  // code rather than a hard-coded "$".
  const money = (amount: number) => `${amount.toLocaleString()} ${result.budget.currency}`;
  const statusEmoji =
    result.pacing.status === "ON_PACE"
      ? "[OK]"
      : result.pacing.status === "AHEAD"
        ? "[AHEAD]"
        : result.pacing.status === "BEHIND"
          ? "[BEHIND]"
          : "[CRITICAL]";

  return [
    {
      type: "text" as const,
      text: `Campaign "${result.campaignId}" Pacing Status:

${statusEmoji} Status: ${result.pacing.status}

Budget:
• Total: ${money(result.budget.total)}
• Spent: ${money(result.budget.spent)} (${result.pacing.actualSpendPercent.toFixed(1)}%)
• Remaining: ${money(result.budget.remaining)}

Flight:
• ${result.flight.startDate} to ${result.flight.endDate}
• Days: ${result.flight.daysElapsed} elapsed / ${result.flight.totalDays} total
• Days Remaining: ${result.flight.daysRemaining}

Pacing Analysis:
• Expected Spend: ${result.pacing.expectedSpendPercent.toFixed(1)}%
• Actual Spend: ${result.pacing.actualSpendPercent.toFixed(1)}%
• Pacing Ratio: ${result.pacing.pacingRatio.toFixed(2)}x
• Projected End Spend: ${money(Number(result.pacing.projectedEndSpend.toFixed(2)))}`,
    },
  ];
}

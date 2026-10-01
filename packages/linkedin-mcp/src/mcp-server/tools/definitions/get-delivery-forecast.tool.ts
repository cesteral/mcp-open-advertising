// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { TargetingCriteriaSchema } from "../utils/targeting-criteria-schema.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "linkedin_get_delivery_forecast";
const TOOL_TITLE = "Get LinkedIn Ads Delivery Forecast";
const TOOL_DESCRIPTION = `Forecast impressions, clicks, spend and related metrics for a LinkedIn campaign setup, using LinkedIn's Ad Supply Forecasts API.

Give the campaign type, a future date range, the targeting, and a budget (\`dailyBudget\` or \`totalBudget\`). With no \`optimizationTarget\` LinkedIn forecasts manual bidding and needs a \`competingBid\`; with an auto-bidding \`optimizationTarget\` it forecasts that.

The result is \`elements[{ metricType, granularity, timeSeries[{ timestamp, value, adForecastRange }] }]\` — IMPRESSION, CLICK, SPENDING, REACH, … at DAILY, SEVEN_DAY, THIRTY_DAY and CUSTOM granularity, each with a low/high range. It is an estimate, not a guarantee, and it does not return an audience size: use linkedin_get_audience_count for that.

Budget amounts and bids are decimal strings in major currency units (\`"300"\` is 300 USD) and the currency must match the ad account's.`;

const MoneySchema = z.object({
  amount: z
    .string()
    .regex(/^\d+(\.\d+)?$/, "amount must be a decimal string like 300 or 10.50")
    .describe('Decimal string in major currency units, e.g. "300"'),
  currencyCode: z
    .string()
    .regex(/^[A-Z]{3}$/, "currencyCode must be a three-letter ISO code like USD")
    .describe("Three-letter ISO currency code, e.g. USD"),
});

const CAMPAIGN_TYPES = ["SPONSORED_UPDATES", "SPONSORED_INMAILS", "DYNAMIC"] as const;

export const GetDeliveryForecastInputSchema = z
  .object({
    adAccountUrn: z
      .string()
      .min(1)
      .describe("The ad account URN (e.g., urn:li:sponsoredAccount:123)"),
    campaignType: z
      .enum(CAMPAIGN_TYPES)
      .describe("Campaign type. Connected-television forecasts only support SPONSORED_UPDATES."),
    startTime: z
      .string()
      .datetime()
      .describe("Forecast start, ISO 8601. LinkedIn requires it to be in the future."),
    endTime: z.string().datetime().describe("Forecast end, ISO 8601, after startTime."),
    targetingCriteria: TargetingCriteriaSchema,
    dailyBudget: MoneySchema.optional().describe(
      "Maximum spend per day. Required if totalBudget is not given."
    ),
    totalBudget: MoneySchema.optional().describe(
      "Maximum spend over the campaign. Required if dailyBudget is not given."
    ),
    competingBid: z
      .object({
        bidType: z.enum(["CPM", "CPC", "CPV"]),
        bidPrice: MoneySchema,
      })
      .optional()
      .describe("The bid to forecast. Required for a manual-bidding forecast."),
    optimizationTarget: z
      .string()
      .optional()
      .describe("Optimization target type for an auto-bidding forecast (LinkedIn default NONE)."),
    campaign: z
      .string()
      .optional()
      .describe("An existing campaign URN, which LinkedIn can use for a better forecast."),
    creativeType: z.string().optional().describe("Creative type, for a better forecast."),
    objectiveType: z.string().optional().describe("Objective type, for a better forecast."),
    enableAudienceNetwork: z
      .boolean()
      .optional()
      .describe("Include LinkedIn Audience Network inventory. Must be true for connected TV."),
    enableAudienceExpansion: z
      .boolean()
      .optional()
      .describe("Include Audience Expansion inventory."),
    connectedTelevisionOnly: z
      .boolean()
      .optional()
      .describe("Forecast a connected-television campaign (API version 202408 and later)."),
    targetCost: z
      .string()
      .optional()
      .describe("Target cost, only for the target-cost optimization target."),
    costCap: z.string().optional().describe("Cost cap, only for the cost-cap optimization target."),
  })
  .superRefine((input, ctx) => {
    const start = Date.parse(input.startTime);
    const end = Date.parse(input.endTime);
    if (!(end > start)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endTime"],
        message: "endTime must be after startTime.",
      });
    }
    if (!input.dailyBudget && !input.totalBudget) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dailyBudget"],
        message: "Give a dailyBudget or a totalBudget; LinkedIn requires one.",
      });
    }
  })
  .describe("Parameters for getting a LinkedIn delivery forecast");

export const GetDeliveryForecastOutputSchema = z
  .object({
    forecast: z.record(z.any()).describe("Forecast data from LinkedIn API"),
    adAccountUrn: z.string(),
    timestamp: z.string().datetime(),
  })
  .describe("Delivery forecast result");

type GetDeliveryForecastInput = z.infer<typeof GetDeliveryForecastInputSchema>;
type GetDeliveryForecastOutput = z.infer<typeof GetDeliveryForecastOutputSchema>;

export async function getDeliveryForecastLogic(
  input: GetDeliveryForecastInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetDeliveryForecastOutput> {
  const { linkedInService } = resolveSessionServices(sdkContext);

  const forecast = await linkedInService.getAdSupplyForecast(
    {
      account: input.adAccountUrn,
      campaignType: input.campaignType,
      timeRange: { start: Date.parse(input.startTime), end: Date.parse(input.endTime) },
      targetingCriteria: input.targetingCriteria,
      dailyBudget: input.dailyBudget,
      totalBudget: input.totalBudget,
      competingBid: input.competingBid,
      optimizationTarget: input.optimizationTarget,
      campaign: input.campaign,
      creativeType: input.creativeType,
      objectiveType: input.objectiveType,
      enableAudienceNetwork: input.enableAudienceNetwork,
      enableAudienceExpansion: input.enableAudienceExpansion,
      connectedTelevisionOnly: input.connectedTelevisionOnly,
      targetCost: input.targetCost,
      costCap: input.costCap,
    },
    context
  );

  return {
    forecast: forecast as Record<string, unknown>,
    adAccountUrn: input.adAccountUrn,
    timestamp: new Date().toISOString(),
  };
}

export function getDeliveryForecastResponseFormatter(
  result: GetDeliveryForecastOutput
): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Delivery forecast for ${result.adAccountUrn}\n\n${JSON.stringify(result.forecast, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const getDeliveryForecastTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: GetDeliveryForecastInputSchema,
  outputSchema: GetDeliveryForecastOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: true,
    idempotentHint: true,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Forecast a Sponsored Content campaign for the US, excluding very large employers",
      input: {
        adAccountUrn: "urn:li:sponsoredAccount:123456789",
        campaignType: "SPONSORED_UPDATES",
        startTime: "2030-01-01T00:00:00.000Z",
        endTime: "2030-01-31T00:00:00.000Z",
        dailyBudget: { amount: "300", currencyCode: "USD" },
        competingBid: { bidType: "CPM", bidPrice: { amount: "10", currencyCode: "USD" } },
        targetingCriteria: {
          include: {
            and: [{ or: { "urn:li:adTargetingFacet:locations": ["urn:li:geo:103644278"] } }],
          },
          exclude: {
            or: {
              "urn:li:adTargetingFacet:staffCountRanges": [
                "urn:li:staffCountRange:(10001,2147483647)",
              ],
            },
          },
        },
      },
    },
  ],
  logic: getDeliveryForecastLogic,
  responseFormatter: getDeliveryForecastResponseFormatter,
  untrustedContent: {
    structuredPaths: ["$.forecast"],
    contentBlocks: [0],
  },
};

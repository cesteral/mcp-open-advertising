// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "linkedin_get_delivery_forecast";
const TOOL_TITLE = "Get LinkedIn Ads Delivery Forecast";
const TOOL_DESCRIPTION = `Get a delivery forecast for a targeting configuration on LinkedIn Ads.

Returns estimated audience size, reach, and impressions for given targeting criteria.
Use this to validate targeting before creating a campaign.

**optimizationTargetType values:** NONE, WEBSITE_CONVERSIONS, LEAD_GENERATION, etc.`;

export const GetDeliveryForecastInputSchema = z
  .object({
    adAccountUrn: z
      .string()
      .min(1)
      .describe("The ad account URN (e.g., urn:li:sponsoredAccount:123)"),
    targetingCriteria: z.record(z.any()).describe("LinkedIn targeting criteria object"),
    optimizationTargetType: z
      .string()
      .optional()
      .describe("Optimization target type for the forecast"),
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

  const forecast = await linkedInService.getDeliveryForecast(
    input.adAccountUrn,
    input.targetingCriteria,
    input.optimizationTargetType,
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
      label: "Forecast for engineer audience in US",
      input: {
        adAccountUrn: "urn:li:sponsoredAccount:123456789",
        targetingCriteria: {
          include: {
            and: [
              {
                or: {
                  "urn:li:adTargetingFacet:geos": ["urn:li:geo:103644278"],
                },
              },
              {
                or: {
                  "urn:li:adTargetingFacet:memberSeniorities": [
                    "urn:li:adSeniority:5",
                    "urn:li:adSeniority:6",
                  ],
                },
              },
            ],
          },
        },
      },
    },
  ],
  logic: getDeliveryForecastLogic,
  responseFormatter: getDeliveryForecastResponseFormatter,
};

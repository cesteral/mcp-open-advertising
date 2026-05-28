// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import type { RequestContext, McpTextContent, SdkContext } from "@cesteral/shared";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
  DSPCampaignForecastMultiStatusResponseSchema,
  DSPSelectedForecastMetricSchema,
  type DSPCampaignForecastMultiStatusResponseT,
} from "../../../services/amazon-dsp/v1-schemas.js";

const TOOL_NAME = "amazon_dsp_get_campaign_forecast";
const TOOL_TITLE = "Get Amazon DSP campaign forecast";
const TOOL_DESCRIPTION = `Retrieve a campaign forecast for one DSP campaign. The Amazon endpoint
supports exactly 1 forecast description per call (the multi-status response
also caps both \`success\` and \`error\` arrays at 1).

Forecast warnings are nested at
\`success[].campaignForecast.flightForecasts[].warnings[]\` — the formatter
summarises them so callers know whether forecast confidence is degraded.`;

const ForecastMetricsDescriptionSchema = z
  .object({
    allMetrics: z.boolean(),
    selectedMetrics: z.array(DSPSelectedForecastMetricSchema).max(20).optional(),
  })
  .describe("Which forecast metrics to request");

const EnabledFeaturesSchema = z
  .object({
    campaignSettingsCache: z.boolean().optional(),
    curve: z.boolean().optional(),
    insights: z.boolean().optional(),
    metrics: ForecastMetricsDescriptionSchema.optional(),
    replanning: z.boolean().optional(),
  })
  .describe("Optional feature toggles for this forecast call");

const CampaignForecastDescriptionSchema = z
  .object({
    campaignId: z.string().min(1).describe("Campaign to forecast"),
    enabledFeatures: EnabledFeaturesSchema.optional(),
    flightIds: z
      .array(z.string().min(1))
      .max(5)
      .optional()
      .describe("Restrict forecast to specific flights (max 5)"),
    replanningSettings: z.record(z.unknown()).optional(),
  })
  .describe("Forecast scope: which campaign + flights, plus optional features");

export const GetCampaignForecastInputSchema = z
  .object({
    profileId: z.string().min(1).describe("Amazon DSP Profile ID"),
    campaignForecastDescriptions: z
      .array(CampaignForecastDescriptionSchema)
      .length(1)
      .describe("Forecast descriptions. Amazon's endpoint accepts exactly 1 entry per call."),
  })
  .describe("Parameters for retrieving a campaign forecast");

export const GetCampaignForecastOutputSchema = z
  .object({
    response: DSPCampaignForecastMultiStatusResponseSchema.describe(
      "Multi-status response (success[].campaignForecast + error[].errors[])"
    ),
    timestamp: z.string().datetime(),
  })
  .describe("Campaign forecast result");

type GetCampaignForecastInput = z.infer<typeof GetCampaignForecastInputSchema>;
type GetCampaignForecastOutput = z.infer<typeof GetCampaignForecastOutputSchema>;

export async function getCampaignForecastLogic(
  input: GetCampaignForecastInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetCampaignForecastOutput> {
  const { amazonDspV1Service } = resolveSessionServices(sdkContext);
  const response = await amazonDspV1Service.retrieveCampaignForecast(
    { campaignForecastDescriptions: input.campaignForecastDescriptions },
    context
  );
  return { response, timestamp: new Date().toISOString() };
}

interface FlightWarning {
  code?: string;
  message?: string;
}
interface FlightForecast {
  warnings?: FlightWarning[];
}
interface SuccessEntry {
  campaignForecast?: {
    flightForecasts?: FlightForecast[];
  };
}

export function getCampaignForecastResponseFormatter(
  result: GetCampaignForecastOutput
): McpTextContent[] {
  const response = result.response as DSPCampaignForecastMultiStatusResponseT;
  const successCount = response.success?.length ?? 0;
  const errorCount = response.error?.length ?? 0;

  let totalWarnings = 0;
  let withWarnings = 0;
  for (const entry of (response.success ?? []) as SuccessEntry[]) {
    const flights = entry.campaignForecast?.flightForecasts ?? [];
    const entryWarnings = flights.reduce((acc, fl) => acc + (fl.warnings?.length ?? 0), 0);
    if (entryWarnings > 0) withWarnings += 1;
    totalWarnings += entryWarnings;
  }

  const summary =
    totalWarnings > 0
      ? `${successCount} succeeded (${withWarnings} with warnings, ${totalWarnings} total warnings), ${errorCount} failed`
      : `${successCount} succeeded, ${errorCount} failed`;

  return [
    {
      type: "text" as const,
      text: `${summary}\n\n${JSON.stringify(response, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const getCampaignForecastTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: GetCampaignForecastInputSchema,
  outputSchema: GetCampaignForecastOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    idempotentHint: true,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Forecast a single campaign",
      input: {
        profileId: "1234567890",
        campaignForecastDescriptions: [{ campaignId: "cmp-abc" }],
      },
    },
    {
      label: "Forecast restricted to one flight, with curve + insights",
      input: {
        profileId: "1234567890",
        campaignForecastDescriptions: [
          {
            campaignId: "cmp-abc",
            flightIds: ["fl-1"],
            enabledFeatures: { curve: true, insights: true },
          },
        ],
      },
    },
  ],
  logic: getCampaignForecastLogic,
  responseFormatter: getCampaignForecastResponseFormatter,
};

// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import type { RequestContext, McpTextContent, SdkContext } from "@cesteral/shared";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { assertAccountScope } from "@cesteral/shared";
import {
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
    accountId: z
      .string()
      .min(1)
      .describe(
        "DSP advertiser ID (a `dspAdvertiserId` from an account's `alternateIds` in amazon_dsp_list_advertisers). Sent as the `Amazon-Ads-AccountId` header, which Amazon requires on this endpoint. Distinct from `profileId`."
      ),
    campaignForecastDescriptions: z
      .array(CampaignForecastDescriptionSchema)
      .length(1)
      .describe("Forecast descriptions. Amazon's endpoint accepts exactly 1 entry per call."),
  })
  .describe("Parameters for retrieving a campaign forecast");

// Compact published outputSchema. The generated
// `DSPCampaignForecastMultiStatusResponseSchema` is ~50 KB once serialized
// (nearly half of this server's `tools/list`), but a client only needs the
// envelope shape and the fields this tool's formatter reads. Everything else
// in the forecast (metrics, curves, insights, ...) still passes through
// unchanged — every object here is `.passthrough()` — so the service keeps
// validating against the full generated schema and the response is not trimmed.
const ForecastWarningSchema = z
  .object({ code: z.string().optional(), message: z.string().optional() })
  .passthrough();

const FlightForecastSchema = z
  .object({
    flightId: z.string().optional(),
    forecastStartDateTime: z.string().optional(),
    forecastEndDateTime: z.string().optional(),
    warnings: z.array(ForecastWarningSchema).optional(),
  })
  .passthrough();

const ForecastSuccessSchema = z
  .object({
    index: z.number().int().optional(),
    campaignForecast: z
      .object({
        campaignDisplayName: z.string().optional(),
        flightForecasts: z.array(FlightForecastSchema).optional(),
      })
      .passthrough()
      .optional()
      .describe(
        "Forecast detail (metrics, curve, insights, flights); passed through as Amazon returns it"
      ),
  })
  .passthrough();

const ForecastErrorSchema = z
  .object({
    index: z.number().int().optional(),
    errors: z.array(ForecastWarningSchema).max(20).optional(),
  })
  .passthrough();

export const GetCampaignForecastOutputSchema = z
  .object({
    response: z
      .object({
        success: z.array(ForecastSuccessSchema).max(1).optional(),
        error: z.array(ForecastErrorSchema).max(1).optional(),
      })
      .passthrough()
      .describe("Multi-status response (success[].campaignForecast + error[].errors[])"),
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
  const { amazonDspV1Service, boundProfileId } = resolveSessionServices(sdkContext);
  assertAccountScope(input.profileId, boundProfileId, "profileId");
  const response = await amazonDspV1Service.retrieveCampaignForecast(
    { campaignForecastDescriptions: input.campaignForecastDescriptions },
    input.accountId,
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
        accountId: "577020615253975655",
        campaignForecastDescriptions: [{ campaignId: "cmp-abc" }],
      },
    },
    {
      label: "Forecast restricted to one flight, with curve + insights",
      input: {
        profileId: "1234567890",
        accountId: "577020615253975655",
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
  untrustedContent: {
    structuredPaths: ["$.response"],
    contentBlocks: [0],
  },
};

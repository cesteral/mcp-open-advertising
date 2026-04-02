// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "snapchat_get_audience_estimate";
const TOOL_TITLE = "Snapchat Audience Size Estimate";
const TOOL_DESCRIPTION = `Get an estimated audience size for a Snapchat targeting configuration.

Use this to validate and tune targeting before creating ad groups.
Backed by Snapchat's documented \`audience_size_v2\` endpoint.

**Example ad squad spec:**
\`\`\`json
{
  "name": "App Install Prospecting",
  "status": "ACTIVE",
  "type": "SNAP_ADS",
  "targeting": {
    "geos": [{ "country_code": "us" }]
  },
  "placement": "CONTENT",
  "bid_micro": 6000000,
  "auto_bid": false,
  "daily_budget_micro": 50000000,
  "delivery_constraint": "DAILY_BUDGET",
  "optimization_goal": "APP_INSTALLS"
}
\`\`\``;

export const GetAudienceEstimateInputSchema = z
  .object({
    adAccountId: z
      .string()
      .min(1)
      .describe("Snapchat Advertiser ID"),
    targetingConfig: z
      .record(z.any())
      .describe("Ad squad spec or targeting spec accepted by Snapchat audience_size_v2"),
  })
  .describe("Parameters for getting a Snapchat audience size estimate");

export const GetAudienceEstimateOutputSchema = z
  .object({
    estimate: z.record(z.any()).describe("Audience size estimate data from Snapchat"),
    timestamp: z.string().datetime(),
  })
  .describe("Audience estimate result");

type GetAudienceEstimateInput = z.infer<typeof GetAudienceEstimateInputSchema>;
type GetAudienceEstimateOutput = z.infer<typeof GetAudienceEstimateOutputSchema>;

export async function getAudienceEstimateLogic(
  input: GetAudienceEstimateInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetAudienceEstimateOutput> {
  const { snapchatService } = resolveSessionServices(sdkContext);

  const estimate = await snapchatService.getAudienceEstimate(
    input.targetingConfig,
    input.adAccountId,
    context
  );

  return {
    estimate: estimate as Record<string, unknown>,
    timestamp: new Date().toISOString(),
  };
}

export function getAudienceEstimateResponseFormatter(result: GetAudienceEstimateOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Audience size estimate:\n${JSON.stringify(result.estimate, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const getAudienceEstimateTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: GetAudienceEstimateInputSchema,
  outputSchema: GetAudienceEstimateOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    idempotentHint: true,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Estimate audience for age and gender targeting",
      input: {
        adAccountId: "1234567890",
        targetingConfig: {
          name: "US Prospecting",
          status: "ACTIVE",
          type: "SNAP_ADS",
          targeting: { geos: [{ country_code: "us" }] },
          placement: "CONTENT",
          optimization_goal: "APP_INSTALLS",
          daily_budget_micro: 50000000,
        },
      },
    },
    {
      label: "Estimate audience with interest targeting",
      input: {
        adAccountId: "1234567890",
        targetingConfig: {
          name: "UK Interest Prospecting",
          status: "ACTIVE",
          type: "SNAP_ADS",
          targeting: {
            geos: [{ country_code: "gb" }],
            interests: [{ category_id: ["SLC_1"], operation: "INCLUDE" }],
          },
          placement: "CONTENT",
          optimization_goal: "IMPRESSIONS",
          daily_budget_micro: 25000000,
        },
      },
    },
  ],
  logic: getAudienceEstimateLogic,
  responseFormatter: getAudienceEstimateResponseFormatter,
};

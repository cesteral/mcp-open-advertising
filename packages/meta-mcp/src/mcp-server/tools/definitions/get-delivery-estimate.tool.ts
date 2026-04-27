// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "meta_get_delivery_estimate";
const TOOL_TITLE = "Get Meta Delivery Estimate";
const TOOL_DESCRIPTION = `Get estimated audience size and delivery estimates for a targeting spec.

Requires a targeting specification with at least one location or custom audience.
Returns estimated daily reach, impressions, and audience size.`;

export const GetDeliveryEstimateInputSchema = z
  .object({
    adAccountId: z.string().describe("Ad Account ID (with or without act_ prefix)"),
    targetingSpec: z
      .record(z.any())
      .describe("Targeting specification (must include geo_locations or custom_audiences)"),
    optimizationGoal: z
      .string()
      .optional()
      .describe("Optimization goal (e.g., LINK_CLICKS, REACH, CONVERSIONS)"),
  })
  .describe("Parameters for getting delivery estimates");

export const GetDeliveryEstimateOutputSchema = z
  .object({
    estimate: z.record(z.any()).describe("Delivery estimate data"),
    timestamp: z.string().datetime(),
  })
  .describe("Delivery estimate result");

type GetDeliveryEstimateInput = z.infer<typeof GetDeliveryEstimateInputSchema>;
type GetDeliveryEstimateOutput = z.infer<typeof GetDeliveryEstimateOutputSchema>;

export async function getDeliveryEstimateLogic(
  input: GetDeliveryEstimateInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetDeliveryEstimateOutput> {
  const { metaService } = resolveSessionServices(sdkContext);

  const result = await metaService.getDeliveryEstimate(
    input.adAccountId,
    input.targetingSpec,
    input.optimizationGoal,
    context
  );

  return {
    estimate: result as Record<string, unknown>,
    timestamp: new Date().toISOString(),
  };
}

export function getDeliveryEstimateResponseFormatter(
  result: GetDeliveryEstimateOutput
): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Delivery estimate:\n${JSON.stringify(result.estimate, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const getDeliveryEstimateTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: GetDeliveryEstimateInputSchema,
  outputSchema: GetDeliveryEstimateOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    idempotentHint: true,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Estimate reach for US 25-44",
      input: {
        adAccountId: "act_123456789",
        targetingSpec: {
          age_min: 25,
          age_max: 44,
          geo_locations: { countries: ["US"] },
        },
        optimizationGoal: "REACH",
      },
    },
  ],
  logic: getDeliveryEstimateLogic,
  responseFormatter: getDeliveryEstimateResponseFormatter,
};

// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "pinterest_get_delivery_estimate";
const TOOL_TITLE = "Pinterest Delivery Estimate";
const TOOL_DESCRIPTION = `Get a delivery estimate for a Pinterest targeting configuration.

Use this to validate and tune targeting before creating ad groups.
Returns estimated reach and audience size ranges.

**Example targeting config:**
\`\`\`json
{
  "age": ["AGE_18_24", "AGE_25_34"],
  "gender": ["GENDER_FEMALE"],
  "location_ids": ["JP"],
  "interest_category_ids": ["123456789"]
}
\`\`\``;

export const GetDeliveryEstimateInputSchema = z
  .object({
    adAccountId: z
      .string()
      .min(1)
      .describe("Pinterest Advertiser ID"),
    targetingConfig: z
      .record(z.any())
      .describe("Targeting specification object with demographic and interest criteria"),
  })
  .describe("Parameters for getting a Pinterest delivery estimate");

export const GetDeliveryEstimateOutputSchema = z
  .object({
    estimate: z.record(z.any()).describe("Delivery estimate data from Pinterest"),
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
  const { pinterestService } = resolveSessionServices(sdkContext);

  const estimate = await pinterestService.getAudienceEstimate(
    { adAccountId: input.adAccountId },
    input.targetingConfig,
    context
  );

  return {
    estimate: estimate as Record<string, unknown>,
    timestamp: new Date().toISOString(),
  };
}

export function getDeliveryEstimateResponseFormatter(result: GetDeliveryEstimateOutput): McpTextContent[] {
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
      label: "Estimate audience for age and gender targeting",
      input: {
        adAccountId: "1234567890",
        targetingConfig: {
          age: ["AGE_18_24", "AGE_25_34"],
          gender: ["GENDER_FEMALE"],
          location_ids: ["US"],
        },
      },
    },
    {
      label: "Estimate audience with interest targeting",
      input: {
        adAccountId: "1234567890",
        targetingConfig: {
          age: ["AGE_25_34"],
          location_ids: ["GB"],
          interest_category_ids: ["123456789", "987654321"],
        },
      },
    },
  ],
  logic: getDeliveryEstimateLogic,
  responseFormatter: getDeliveryEstimateResponseFormatter,
};
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

export const GetAudienceEstimateInputSchema = z
  .object({
    adAccountId: z
      .string()
      .min(1)
      .describe("Snapchat Advertiser ID"),
    targetingConfig: z
      .record(z.any())
      .describe("Targeting specification object with demographic and interest criteria"),
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
  logic: getAudienceEstimateLogic,
  responseFormatter: getAudienceEstimateResponseFormatter,
};
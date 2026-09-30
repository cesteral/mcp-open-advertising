// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { assertAccountScope } from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "pinterest_get_delivery_estimate";
const TOOL_TITLE = "Pinterest Delivery Estimate";
const TOOL_DESCRIPTION = `Get the potential audience size for a Pinterest targeting spec.

Calls \`POST /v5/ad_accounts/{ad_account_id}/ad_groups/audience_sizing\` with \`targetingConfig\` sent as the ad group \`targeting_spec\`.
Use this to tune targeting before creating ad groups. Returns \`audience_size_lower_bound\` / \`audience_size_upper_bound\` (estimated people reachable per month; not a delivery guarantee).

**Example targeting spec** (keys are Pinterest \`targeting_spec\` fields; find ids with \`pinterest_search_targeting\`):
\`\`\`json
{
  "AGE_BUCKET": ["18-24", "25-34"],
  "GENDER": ["female"],
  "LOCATION": ["US"],
  "INTEREST": ["935541271955"]
}
\`\`\``;

export const GetDeliveryEstimateInputSchema = z
  .object({
    adAccountId: z.string().min(1).describe("Pinterest Advertiser ID"),
    targetingConfig: z
      .record(z.any())
      .describe(
        "Pinterest ad group targeting_spec (e.g. AGE_BUCKET, GENDER, LOCATION, GEO, INTEREST, LOCALE, APPTYPE)"
      ),
  })
  .describe("Parameters for getting a Pinterest delivery estimate");

export const GetDeliveryEstimateOutputSchema = z
  .object({
    estimate: z
      .record(z.any())
      .describe(
        "Pinterest audience sizing response (audience_size_lower_bound / audience_size_upper_bound)"
      ),
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
  const { pinterestService, boundAdAccountId } = resolveSessionServices(sdkContext);
  assertAccountScope(input.adAccountId, boundAdAccountId, "adAccountId");

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
      label: "Estimate audience for age and gender targeting",
      input: {
        adAccountId: "1234567890",
        targetingConfig: {
          AGE_BUCKET: ["18-24", "25-34"],
          GENDER: ["female"],
          LOCATION: ["US"],
        },
      },
    },
    {
      label: "Estimate audience with interest targeting",
      input: {
        adAccountId: "1234567890",
        targetingConfig: {
          AGE_BUCKET: ["25-34"],
          LOCATION: ["GB"],
          INTEREST: ["123456789", "987654321"],
        },
      },
    },
  ],
  logic: getDeliveryEstimateLogic,
  responseFormatter: getDeliveryEstimateResponseFormatter,
  untrustedContent: {
    structuredPaths: ["$.estimate"],
    contentBlocks: [0],
  },
};

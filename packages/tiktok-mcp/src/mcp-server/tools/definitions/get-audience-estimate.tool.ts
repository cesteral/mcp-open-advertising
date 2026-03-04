import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "tiktok_get_audience_estimate";
const TOOL_TITLE = "TikTok Audience Size Estimate";
const TOOL_DESCRIPTION = `Get an estimated audience size for a TikTok targeting configuration.

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
    advertiserId: z
      .string()
      .min(1)
      .describe("TikTok Advertiser ID"),
    targetingConfig: z
      .record(z.any())
      .describe("Targeting specification object with demographic and interest criteria"),
  })
  .describe("Parameters for getting a TikTok audience size estimate");

export const GetAudienceEstimateOutputSchema = z
  .object({
    estimate: z.record(z.any()).describe("Audience size estimate data from TikTok"),
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
  const { tiktokService } = resolveSessionServices(sdkContext);

  const estimate = await tiktokService.getAudienceEstimate(
    input.targetingConfig,
    context
  );

  return {
    estimate: estimate as Record<string, unknown>,
    timestamp: new Date().toISOString(),
  };
}

export function getAudienceEstimateResponseFormatter(result: GetAudienceEstimateOutput): unknown[] {
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
  },
  inputExamples: [
    {
      label: "Estimate audience for age and gender targeting",
      input: {
        advertiserId: "1234567890",
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
        advertiserId: "1234567890",
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

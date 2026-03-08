import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "tiktok_get_ad_previews";
const TOOL_TITLE = "Get TikTok Ad Preview";
const TOOL_DESCRIPTION = `Get a preview of how a TikTok ad will appear to users.

Returns preview data including image/video URLs and ad text as they will
be displayed on TikTok's platform.

**Common ad formats:** FEED, STORY, SPARK_ADS`;

export const GetAdPreviewsInputSchema = z
  .object({
    advertiserId: z
      .string()
      .min(1)
      .describe("TikTok Advertiser ID"),
    adId: z
      .string()
      .min(1)
      .describe("The ad ID to preview"),
    adFormat: z
      .string()
      .optional()
      .describe("Ad format to preview (e.g., FEED, STORY, SPARK_ADS)"),
  })
  .describe("Parameters for getting TikTok ad previews");

export const GetAdPreviewsOutputSchema = z
  .object({
    preview: z.record(z.any()).describe("Ad preview data from TikTok"),
    adId: z.string(),
    timestamp: z.string().datetime(),
  })
  .describe("Ad preview result");

type GetAdPreviewsInput = z.infer<typeof GetAdPreviewsInputSchema>;
type GetAdPreviewsOutput = z.infer<typeof GetAdPreviewsOutputSchema>;

export async function getAdPreviewsLogic(
  input: GetAdPreviewsInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetAdPreviewsOutput> {
  const { tiktokService } = resolveSessionServices(sdkContext);

  const preview = await tiktokService.getAdPreviews(
    input.adId,
    input.adFormat,
    context
  );

  return {
    preview: preview as Record<string, unknown>,
    adId: input.adId,
    timestamp: new Date().toISOString(),
  };
}

export function getAdPreviewsResponseFormatter(result: GetAdPreviewsOutput): unknown[] {
  return [
    {
      type: "text" as const,
      text: `Ad preview for ${result.adId}:\n${JSON.stringify(result.preview, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const getAdPreviewsTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: GetAdPreviewsInputSchema,
  outputSchema: GetAdPreviewsOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    idempotentHint: true,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Preview a TikTok feed ad",
      input: {
        advertiserId: "1234567890",
        adId: "1600123456789",
        adFormat: "FEED",
      },
    },
    {
      label: "Preview an ad without specifying format",
      input: {
        advertiserId: "1234567890",
        adId: "1600123456789",
      },
    },
  ],
  logic: getAdPreviewsLogic,
  responseFormatter: getAdPreviewsResponseFormatter,
};

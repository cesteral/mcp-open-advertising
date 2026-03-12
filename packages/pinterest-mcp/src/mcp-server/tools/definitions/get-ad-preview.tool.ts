import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "pinterest_get_ad_preview";
const TOOL_TITLE = "Get Pinterest Ad Preview";
const TOOL_DESCRIPTION = `Get a preview of how a Pinterest ad will appear to users.

Returns preview data including image/video URLs and ad text as they will
be displayed on Pinterest's platform.

**Common ad formats:** FEED, STORY, SPARK_ADS`;

export const GetAdPreviewInputSchema = z
  .object({
    adAccountId: z
      .string()
      .min(1)
      .describe("Pinterest Advertiser ID"),
    adId: z
      .string()
      .min(1)
      .describe("The ad ID to preview"),
    adFormat: z
      .string()
      .optional()
      .describe("Ad format to preview (e.g., FEED, STORY, SPARK_ADS)"),
  })
  .describe("Parameters for getting Pinterest ad preview");

export const GetAdPreviewOutputSchema = z
  .object({
    preview: z.record(z.any()).describe("Ad preview data from Pinterest"),
    adId: z.string(),
    timestamp: z.string().datetime(),
  })
  .describe("Ad preview result");

type GetAdPreviewInput = z.infer<typeof GetAdPreviewInputSchema>;
type GetAdPreviewOutput = z.infer<typeof GetAdPreviewOutputSchema>;

export async function getAdPreviewLogic(
  input: GetAdPreviewInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetAdPreviewOutput> {
  const { pinterestService } = resolveSessionServices(sdkContext);

  const preview = await pinterestService.getAdPreviews(
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

export function getAdPreviewResponseFormatter(result: GetAdPreviewOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Ad preview for ${result.adId}:\n${JSON.stringify(result.preview, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const getAdPreviewTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: GetAdPreviewInputSchema,
  outputSchema: GetAdPreviewOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    idempotentHint: true,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Preview a Pinterest feed ad",
      input: {
        adAccountId: "1234567890",
        adId: "1600123456789",
        adFormat: "FEED",
      },
    },
    {
      label: "Preview an ad without specifying format",
      input: {
        adAccountId: "1234567890",
        adId: "1600123456789",
      },
    },
  ],
  logic: getAdPreviewLogic,
  responseFormatter: getAdPreviewResponseFormatter,
};

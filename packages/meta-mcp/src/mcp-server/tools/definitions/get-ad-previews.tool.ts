import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "meta_get_ad_previews";
const TOOL_TITLE = "Get Meta Ad Previews";
const TOOL_DESCRIPTION = `Get preview HTML for an ad in a specific format.

Returns temporary HTML iframe content showing how the ad will appear.

**Common ad formats:** DESKTOP_FEED_STANDARD, MOBILE_FEED_STANDARD, INSTAGRAM_STANDARD, RIGHT_COLUMN_STANDARD, AUDIENCE_NETWORK_INSTREAM_VIDEO, MARKETPLACE_MOBILE`;

export const GetAdPreviewsInputSchema = z
  .object({
    adId: z
      .string()
      .min(1)
      .describe("Ad ID to preview"),
    adFormat: z
      .string()
      .describe("Ad format (e.g., DESKTOP_FEED_STANDARD, MOBILE_FEED_STANDARD)"),
  })
  .describe("Parameters for getting ad previews");

export const GetAdPreviewsOutputSchema = z
  .object({
    previews: z.array(z.record(z.any())).describe("Preview data (includes iframe HTML)"),
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
  const { metaService } = resolveSessionServices(sdkContext);

  const result = await metaService.getAdPreviews(
    input.adId,
    input.adFormat,
    context
  );

  const data = (result as Record<string, unknown>)?.data as unknown[] || [];

  return {
    previews: data as Record<string, unknown>[],
    timestamp: new Date().toISOString(),
  };
}

export function getAdPreviewsResponseFormatter(result: GetAdPreviewsOutput): unknown[] {
  return [
    {
      type: "text" as const,
      text: `Ad preview(s):\n${JSON.stringify(result.previews, null, 2)}\n\nTimestamp: ${result.timestamp}`,
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
  },
  inputExamples: [
    {
      label: "Preview an ad in desktop feed format",
      input: {
        adId: "23456789012345",
        adFormat: "DESKTOP_FEED_STANDARD",
      },
    },
  ],
  logic: getAdPreviewsLogic,
  responseFormatter: getAdPreviewsResponseFormatter,
};

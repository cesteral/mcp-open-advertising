import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "linkedin_get_ad_preview";
const TOOL_TITLE = "Get LinkedIn Ads Ad Preview";
const TOOL_DESCRIPTION = `Get a preview of a LinkedIn Ads creative.

Returns preview rendering data for a creative URN.

**adFormat values:** SINGLE_IMAGE_AD, VIDEO_AD, CAROUSEL_AD, TEXT_AD,
SPOTLIGHT_AD, FOLLOWER_AD, MESSAGE_AD, CONVERSATION_AD`;

export const GetAdPreviewInputSchema = z
  .object({
    creativeUrn: z
      .string()
      .min(1)
      .describe("The creative URN to preview (e.g., urn:li:sponsoredCreative:123)"),
    adFormat: z
      .string()
      .optional()
      .describe("Ad format for the preview (e.g., SINGLE_IMAGE_AD)"),
  })
  .describe("Parameters for getting a LinkedIn ad preview");

export const GetAdPreviewOutputSchema = z
  .object({
    preview: z.record(z.any()).describe("Preview data from LinkedIn API"),
    creativeUrn: z.string(),
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
  const { linkedInService } = resolveSessionServices(sdkContext);

  const preview = await linkedInService.getAdPreviews(
    input.creativeUrn,
    input.adFormat,
    context
  );

  return {
    preview: preview as Record<string, unknown>,
    creativeUrn: input.creativeUrn,
    timestamp: new Date().toISOString(),
  };
}

export function getAdPreviewResponseFormatter(result: GetAdPreviewOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Ad preview for ${result.creativeUrn}\n\n${JSON.stringify(result.preview, null, 2)}\n\nTimestamp: ${result.timestamp}`,
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
      label: "Get preview for a creative",
      input: {
        creativeUrn: "urn:li:sponsoredCreative:123456789",
        adFormat: "SINGLE_IMAGE_AD",
      },
    },
  ],
  logic: getAdPreviewLogic,
  responseFormatter: getAdPreviewResponseFormatter,
};

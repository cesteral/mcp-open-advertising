// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "linkedin_get_ad_preview";
const TOOL_TITLE = "Get LinkedIn Ads Ad Preview";
const TOOL_DESCRIPTION = `Get the preview of an existing LinkedIn Ads creative.

Returns one preview per placement (e.g. FEED on DESKTOP_WEBSITE and MOBILE_WEBSITE), each an \`<iframe>\` HTML string to embed. The iframes are valid for about 3 hours; call again for a fresh one. LinkedIn supports previews of single image, carousel, video, single job and event ads.

This previews a creative that already exists. Previewing content before a creative is created is a separate LinkedIn call (livePreviewForCreative) that this tool does not make.`;

export const GetAdPreviewInputSchema = z
  .object({
    creativeUrn: z
      .string()
      .min(1)
      .describe("The creative URN to preview (e.g., urn:li:sponsoredCreative:123)"),
    adAccountUrn: z
      .string()
      .min(1)
      .describe("The ad account URN the creative belongs to (e.g., urn:li:sponsoredAccount:123)"),
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
    input.adAccountUrn,
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
      text: `Ad preview for ${result.creativeUrn} (preview iframes are valid for about 3 hours)\n\n${JSON.stringify(result.preview, null, 2)}\n\nTimestamp: ${result.timestamp}`,
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
      label: "Get previews for a creative",
      input: {
        creativeUrn: "urn:li:sponsoredCreative:123456789",
        adAccountUrn: "urn:li:sponsoredAccount:123456789",
      },
    },
  ],
  logic: getAdPreviewLogic,
  responseFormatter: getAdPreviewResponseFormatter,
  untrustedContent: {
    structuredPaths: ["$.preview"],
    contentBlocks: [0],
  },
};

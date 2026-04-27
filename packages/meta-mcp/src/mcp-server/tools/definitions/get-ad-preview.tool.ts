// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "meta_get_ad_preview";
const TOOL_TITLE = "Get Meta Ad Preview";
const TOOL_DESCRIPTION = `Get preview HTML for an ad in a specific format.

Returns temporary HTML iframe content showing how the ad will appear.

**Common ad formats:** DESKTOP_FEED_STANDARD, MOBILE_FEED_STANDARD, INSTAGRAM_STANDARD, RIGHT_COLUMN_STANDARD, AUDIENCE_NETWORK_INSTREAM_VIDEO, MARKETPLACE_MOBILE`;

export const GetAdPreviewInputSchema = z
  .object({
    adId: z.string().min(1).describe("Ad ID to preview"),
    adFormat: z.string().describe("Ad format (e.g., DESKTOP_FEED_STANDARD, MOBILE_FEED_STANDARD)"),
  })
  .describe("Parameters for getting ad preview");

export const GetAdPreviewOutputSchema = z
  .object({
    previews: z.array(z.record(z.any())).describe("Preview data (includes iframe HTML)"),
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
  const { metaService } = resolveSessionServices(sdkContext);

  const result = await metaService.getAdPreviews(input.adId, input.adFormat, context);

  const data = ((result as Record<string, unknown>)?.data as unknown[]) || [];

  return {
    previews: data as Record<string, unknown>[],
    timestamp: new Date().toISOString(),
  };
}

export function getAdPreviewResponseFormatter(result: GetAdPreviewOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Ad preview(s):\n${JSON.stringify(result.previews, null, 2)}\n\nTimestamp: ${result.timestamp}`,
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
      label: "Preview an ad in desktop feed format",
      input: {
        adId: "23456789012345",
        adFormat: "DESKTOP_FEED_STANDARD",
      },
    },
  ],
  logic: getAdPreviewLogic,
  responseFormatter: getAdPreviewResponseFormatter,
};

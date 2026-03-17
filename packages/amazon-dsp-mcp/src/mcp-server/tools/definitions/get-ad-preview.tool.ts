// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "amazon_dsp_get_ad_preview";
const TOOL_TITLE = "Get AmazonDsp Ad Preview";
const TOOL_DESCRIPTION = `Get a preview of how an Amazon DSP creative will appear to users.

Returns preview data for the creative as served via the Amazon DSP platform.
Uses the \`GET /dsp/creatives/{creativeId}/preview\` endpoint.`;

export const GetAdPreviewInputSchema = z
  .object({
    profileId: z
      .string()
      .min(1)
      .describe("Amazon DSP Advertiser ID"),
    adId: z
      .string()
      .min(1)
      .describe("The creative ID to preview"),
  })
  .describe("Parameters for getting an Amazon DSP creative preview");

export const GetAdPreviewOutputSchema = z
  .object({
    preview: z.record(z.any()).describe("Ad preview data from AmazonDsp"),
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
  const { amazonDspService } = resolveSessionServices(sdkContext);

  const preview = await amazonDspService.getAdPreviews(
    input.adId,
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
      label: "Preview an Amazon DSP creative",
      input: {
        profileId: "1234567890",
        adId: "cre_123456789",
      },
    },
  ],
  logic: getAdPreviewLogic,
  responseFormatter: getAdPreviewResponseFormatter,
};
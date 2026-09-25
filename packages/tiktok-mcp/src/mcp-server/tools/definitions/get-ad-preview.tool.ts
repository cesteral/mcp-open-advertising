// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { McpError, JsonRpcErrorCode } from "@cesteral/shared";
import { TIKTOK_AD_PREVIEW_UNSUPPORTED_MESSAGE } from "../../../services/tiktok/tiktok-service.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "tiktok_get_ad_preview";
const TOOL_TITLE = "Get TikTok Ad Preview";
const TOOL_DESCRIPTION = `Get a preview of a TikTok ad — NOT AVAILABLE on TikTok.

TikTok Marketing API v1.3 has no ad-preview endpoint, so this tool always returns an error.
Inspect the ad's creative fields with \`tiktok_get_entity\` (entityType "ad") instead.`;

export const GetAdPreviewInputSchema = z
  .object({
    advertiserId: z.string().min(1).describe("TikTok Advertiser ID"),
    adId: z.string().min(1).describe("The ad ID to preview"),
    adFormat: z.string().optional().describe("Ad format to preview (e.g., FEED, STORY, SPARK_ADS)"),
  })
  .describe("Parameters for getting TikTok ad preview");

export const GetAdPreviewOutputSchema = z
  .object({
    preview: z.record(z.any()).describe("Ad preview data from TikTok"),
    adId: z.string(),
    timestamp: z.string().datetime(),
  })
  .describe("Ad preview result");

type GetAdPreviewInput = z.infer<typeof GetAdPreviewInputSchema>;
type GetAdPreviewOutput = z.infer<typeof GetAdPreviewOutputSchema>;

export async function getAdPreviewLogic(
  _input: GetAdPreviewInput,
  _context: RequestContext,
  _sdkContext?: SdkContext
): Promise<GetAdPreviewOutput> {
  // TikTok's official v1.3 SDK defines no ad-preview endpoint; refuse rather
  // than call a path that is not part of the API.
  throw new McpError(JsonRpcErrorCode.InvalidRequest, TIKTOK_AD_PREVIEW_UNSUPPORTED_MESSAGE);
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
  logic: getAdPreviewLogic,
  responseFormatter: getAdPreviewResponseFormatter,
  untrustedContent: {
    structuredPaths: ["$.preview"],
    contentBlocks: [0],
  },
};

// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { assertAccountScope } from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

/** Pinterest v5 `AdPinPreviewCreativeType` — `creative_type` of a Pin-sourced ad preview. */
const AD_PREVIEW_CREATIVE_TYPES = [
  "SHOPPING",
  "COLLECTION",
  "MAX_VIDEO",
  "MAX_WIDTH_VIDEO_COLLECTION",
  "MAX_WIDTH_REGULAR_COLLECTION",
] as const;

const TOOL_NAME = "pinterest_get_ad_preview";
const TOOL_TITLE = "Get Pinterest Ad Preview";
const TOOL_DESCRIPTION = `Get a preview of how a Pinterest ad will appear to users.

Pinterest v5 previews a Pin, not an ad id: this reads the ad to find its \`pin_id\`, then calls \`POST /v5/ad_accounts/{ad_account_id}/ad_previews\`. That endpoint needs the \`ads:write\` scope and creates a preview page; the returned \`url\` expires after 7 days. No ad, campaign or spend is changed.

**Creative types (optional):** ${AD_PREVIEW_CREATIVE_TYPES.join(", ")}`;

export const GetAdPreviewInputSchema = z
  .object({
    adAccountId: z.string().min(1).describe("Pinterest Advertiser ID"),
    adId: z.string().min(1).describe("The ad ID to preview"),
    creativeType: z
      .enum(AD_PREVIEW_CREATIVE_TYPES)
      .optional()
      .describe("Optional preview creative_type; omit to preview the Pin as-is"),
  })
  .describe("Parameters for getting Pinterest ad preview");

export const GetAdPreviewOutputSchema = z
  .object({
    preview: z
      .record(z.any())
      .describe("Pinterest ad preview response: { url } — preview page, expires in 7 days"),
    adId: z.string(),
    pinId: z.string().describe("The ad's pin_id the preview was created from"),
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
  const { pinterestService, boundAdAccountId } = resolveSessionServices(sdkContext);
  assertAccountScope(input.adAccountId, boundAdAccountId, "adAccountId");

  const { pinId, preview } = await pinterestService.getAdPreviews(
    { adAccountId: input.adAccountId },
    input.adId,
    input.creativeType,
    context
  );

  return {
    preview: preview as Record<string, unknown>,
    adId: input.adId,
    pinId,
    timestamp: new Date().toISOString(),
  };
}

export function getAdPreviewResponseFormatter(result: GetAdPreviewOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Ad preview for ${result.adId} (pin ${result.pinId}):\n${JSON.stringify(result.preview, null, 2)}\n\nTimestamp: ${result.timestamp}`,
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
      label: "Preview a Pinterest video ad",
      input: {
        adAccountId: "1234567890",
        adId: "1600123456789",
        creativeType: "MAX_VIDEO",
      },
    },
    {
      label: "Preview an ad without specifying a creative type",
      input: {
        adAccountId: "1234567890",
        adId: "1600123456789",
      },
    },
  ],
  logic: getAdPreviewLogic,
  responseFormatter: getAdPreviewResponseFormatter,
};

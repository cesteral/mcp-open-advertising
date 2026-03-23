// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "cm360_get_ad_preview";
const TOOL_TITLE = "Get CM360 Ad Preview";
const TOOL_DESCRIPTION = `Get details for a CM360 ad, including its creative assignments and click-through configuration.

Fetches the full ad entity. CM360 does not provide a native ad preview URL — use the returned creative assignments and ad configuration to understand the ad setup.`;

export const GetAdPreviewInputSchema = z
  .object({
    profileId: z
      .string()
      .min(1)
      .describe("CM360 User Profile ID"),
    adId: z
      .string()
      .min(1)
      .describe("Ad ID to preview"),
  })
  .describe("Parameters for getting an ad preview");

export const GetAdPreviewOutputSchema = z
  .object({
    adId: z.string().describe("Ad ID"),
    adName: z.string().optional().describe("Ad name"),
    previewUrl: z.string().optional().describe("Preview URL"),
    ad: z.record(z.any()).describe("Full ad entity data"),
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
  const { cm360Service } = resolveSessionServices(sdkContext);

  const ad = (await cm360Service.getEntity(
    "ad",
    input.profileId,
    input.adId,
    context
  )) as unknown as Record<string, unknown>;

  // CM360 ads don't have a native preview URL endpoint.
  // Extract click-through URL if available for reference.
  const clickThroughUrl = ad.clickThroughUrl as Record<string, unknown> | undefined;
  const landingPageUrl = clickThroughUrl?.computedClickThroughUrl as string | undefined;

  return {
    adId: input.adId,
    adName: ad.name as string | undefined,
    previewUrl: landingPageUrl,
    ad: ad as Record<string, any>,
    timestamp: new Date().toISOString(),
  };
}

export function getAdPreviewResponseFormatter(result: GetAdPreviewOutput): McpTextContent[] {
  const nameInfo = result.adName ? ` (${result.adName})` : "";
  const previewInfo = result.previewUrl
    ? `\n\nPreview URL: ${result.previewUrl}`
    : "\n\nNo preview URL available.";

  return [
    {
      type: "text" as const,
      text: `Ad ${result.adId}${nameInfo}${previewInfo}\n\nAd details:\n${JSON.stringify(result.ad, null, 2)}\n\nTimestamp: ${result.timestamp}`,
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
    openWorldHint: true,
    destructiveHint: false,
    idempotentHint: true,
  },
  inputExamples: [
    {
      label: "Preview an ad",
      input: {
        profileId: "123456",
        adId: "789012",
      },
    },
  ],
  logic: getAdPreviewLogic,
  responseFormatter: getAdPreviewResponseFormatter,
};
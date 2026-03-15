// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent, SdkContext } from "@cesteral/shared";

const TOOL_NAME = "msads_get_ad_preview";
const TOOL_TITLE = "Get Microsoft Ads Ad Preview";
const TOOL_DESCRIPTION = `Get a preview of a Microsoft Advertising ad by retrieving its full details including ad copy, URLs, and extensions.`;

export const GetAdPreviewInputSchema = z
  .object({
    adIds: z
      .array(z.string())
      .min(1)
      .describe("Ad IDs to preview"),
    adGroupId: z
      .string()
      .describe("Ad Group ID containing the ads"),
  })
  .describe("Parameters for getting ad previews");

export const GetAdPreviewOutputSchema = z
  .object({
    ads: z.array(z.record(z.any())),
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
  const { msadsService } = resolveSessionServices(sdkContext);

  const result = (await msadsService.executeOperation(
    "/Ads/GetByIds",
    {
      AdIds: input.adIds.map(Number),
      AdGroupId: Number(input.adGroupId),
      AdTypes: null,
    },
    context
  )) as Record<string, unknown>;

  const ads = (result.Ads as Record<string, unknown>[]) ?? [];

  return {
    ads,
    timestamp: new Date().toISOString(),
  };
}

export function getAdPreviewResponseFormatter(result: GetAdPreviewOutput): McpTextContent[] {
  if (result.ads.length === 0) {
    return [{ type: "text" as const, text: "No ads found for the given IDs." }];
  }

  const previews = result.ads.map((ad: Record<string, unknown>) => {
    const lines = [
      `Ad ID: ${ad.Id}`,
      `Type: ${ad.Type ?? "Unknown"}`,
      `Status: ${ad.Status ?? "Unknown"}`,
    ];
    if (ad.TitlePart1) lines.push(`Title 1: ${ad.TitlePart1}`);
    if (ad.TitlePart2) lines.push(`Title 2: ${ad.TitlePart2}`);
    if (ad.TitlePart3) lines.push(`Title 3: ${ad.TitlePart3}`);
    if (ad.Text) lines.push(`Description: ${ad.Text}`);
    if (ad.TextPart2) lines.push(`Description 2: ${ad.TextPart2}`);
    if (ad.FinalUrls) lines.push(`Final URL: ${JSON.stringify(ad.FinalUrls)}`);
    if (ad.Path1) lines.push(`Path: /${ad.Path1}${ad.Path2 ? `/${ad.Path2}` : ""}`);
    return lines.join("\n");
  });

  return [
    {
      type: "text" as const,
      text: `Ad Previews:\n\n${previews.join("\n\n---\n\n")}\n\nTimestamp: ${result.timestamp}`,
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
      label: "Preview ads",
      input: { adIds: ["111", "222"], adGroupId: "333" },
    },
  ],
  logic: getAdPreviewLogic,
  responseFormatter: getAdPreviewResponseFormatter,
};
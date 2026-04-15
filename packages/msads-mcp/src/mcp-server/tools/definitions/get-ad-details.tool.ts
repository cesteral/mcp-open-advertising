// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent, SdkContext } from "@cesteral/shared";

const TOOL_NAME = "msads_get_ad_details";
const TOOL_TITLE = "Get Microsoft Ads Ad Details";
const TOOL_DESCRIPTION = `Get the full details of one or more Microsoft Advertising ads — copy, URLs, status, and other fields. Microsoft Advertising does not expose a rendered ad-preview endpoint; this tool returns the stored ad payload via the CampaignManagement /Ads/QueryByIds operation.`;

export const GetAdDetailsInputSchema = z
  .object({
    adIds: z
      .array(z.string())
      .min(1)
      .describe("Ad IDs to retrieve"),
    adGroupId: z
      .string()
      .describe("Ad Group ID containing the ads"),
  })
  .describe("Parameters for getting ad details");

export const GetAdDetailsOutputSchema = z
  .object({
    ads: z.array(z.record(z.any())),
    timestamp: z.string().datetime(),
  })
  .describe("Ad details result");

type GetAdDetailsInput = z.infer<typeof GetAdDetailsInputSchema>;
type GetAdDetailsOutput = z.infer<typeof GetAdDetailsOutputSchema>;

export async function getAdDetailsLogic(
  input: GetAdDetailsInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetAdDetailsOutput> {
  const { msadsService } = resolveSessionServices(sdkContext);

  const result = (await msadsService.executeReadOperation(
    "/Ads/QueryByIds",
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

export function getAdDetailsResponseFormatter(result: GetAdDetailsOutput): McpTextContent[] {
  if (result.ads.length === 0) {
    return [{ type: "text" as const, text: "No ads found for the given IDs." }];
  }

  const details = result.ads.map((ad: Record<string, unknown>) => {
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
      text: `Ad Details:\n\n${details.join("\n\n---\n\n")}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const getAdDetailsTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: GetAdDetailsInputSchema,
  outputSchema: GetAdDetailsOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    idempotentHint: true,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Get ad details",
      input: { adIds: ["111", "222"], adGroupId: "333" },
    },
  ],
  logic: getAdDetailsLogic,
  responseFormatter: getAdDetailsResponseFormatter,
};

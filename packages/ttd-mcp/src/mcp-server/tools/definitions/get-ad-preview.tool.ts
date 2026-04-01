// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { TtdEntityType } from "../utils/entity-mapping.js";
import type { McpTextContent, RequestContext } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "ttd_get_ad_preview";
const TOOL_TITLE = "Get TTD Creative Preview";
const TOOL_DESCRIPTION = `Get a preview URL for a TTD creative.

Fetches the creative entity and extracts its preview URL.
Returns creative metadata including name, format, and click URL.

**Usage:** Use creativeId from ttd_list_entities or ttd_create_entity.`;

export const GetAdPreviewInputSchema = z
  .object({
    creativeId: z.string().min(1).describe("TTD Creative ID"),
  })
  .describe("Parameters for getting a TTD creative preview");

export const GetAdPreviewOutputSchema = z
  .object({
    previewUrl: z.string().optional().describe("Preview URL for the creative"),
    creativeName: z.string().optional().describe("Creative name"),
    clickUrl: z.string().optional().describe("Click-through URL"),
    adFormat: z.string().optional().describe("Ad format/type"),
    creativeId: z.string(),
  })
  .describe("TTD creative preview info");

type GetAdPreviewInput = z.infer<typeof GetAdPreviewInputSchema>;
type GetAdPreviewOutput = z.infer<typeof GetAdPreviewOutputSchema>;

interface TTDCreativeResponse {
  CreativeId?: string;
  CreativeName?: string;
  PreviewUrl?: string;
  ShareLink?: string;
  ClickUrl?: string;
  CreativeType?: string;
  TradeDeskHostedVideoAttributes?: {
    ClickthroughUrl?: string;
    LandingPageUrl?: string;
  };
}

export async function getAdPreviewLogic(
  input: GetAdPreviewInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetAdPreviewOutput> {
  const { ttdService } = resolveSessionServices(sdkContext);

  const creative = (await ttdService.getEntity(
    "creative" as TtdEntityType,
    input.creativeId,
    context
  )) as TTDCreativeResponse;

  return {
    previewUrl: creative.PreviewUrl || creative.ShareLink,
    creativeName: creative.CreativeName,
    clickUrl: creative.ClickUrl
      || creative.TradeDeskHostedVideoAttributes?.ClickthroughUrl
      || creative.TradeDeskHostedVideoAttributes?.LandingPageUrl,
    adFormat: creative.CreativeType,
    creativeId: input.creativeId,
  };
}

export function getAdPreviewResponseFormatter(result: GetAdPreviewOutput): McpTextContent[] {
  const lines: string[] = [
    "TTD Creative Preview",
    "",
    `Creative ID: ${result.creativeId}`,
  ];

  if (result.creativeName) lines.push(`Name: ${result.creativeName}`);
  if (result.adFormat) lines.push(`Format: ${result.adFormat}`);
  if (result.clickUrl) lines.push(`Click URL: ${result.clickUrl}`);

  if (result.previewUrl) {
    lines.push("", `Preview URL: ${result.previewUrl}`);
  } else {
    lines.push("", "No preview URL available for this creative.");
  }

  return [
    {
      type: "text" as const,
      text: lines.join("\n"),
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
      label: "Preview a TTD creative",
      input: {
        creativeId: "abcdef123456",
      },
    },
  ],
  logic: getAdPreviewLogic,
  responseFormatter: getAdPreviewResponseFormatter,
};
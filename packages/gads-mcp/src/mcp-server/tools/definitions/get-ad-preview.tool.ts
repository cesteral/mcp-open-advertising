// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { GAdsEntityType } from "../utils/entity-mapping.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "gads_get_ad_preview";
const TOOL_TITLE = "Get Google Ads Ad Preview";
const TOOL_DESCRIPTION = `Get preview information for a Google Ads ad.

Fetches the ad entity via GAQL and returns its type, resource name, and final URLs.
The resource name can be used with the Google Ads generateAdPreview API for a full HTML render.

**Usage:** Use adId from gads_list_entities with entityType=ad or gads_create_entity.
The adId is the numeric ID, not the resource name.`;

export const GetAdPreviewInputSchema = z
  .object({
    customerId: z
      .string()
      .min(1)
      .describe("Google Ads Customer ID (without dashes, e.g., 1234567890)"),
    adId: z.string().min(1).describe("Google Ads Ad ID"),
  })
  .describe("Parameters for getting a Google Ads ad preview");

export const GetAdPreviewOutputSchema = z
  .object({
    adType: z.string().optional().describe("Ad type (e.g., RESPONSIVE_SEARCH_AD, IMAGE_AD)"),
    finalUrls: z.array(z.string()).optional().describe("Final destination URLs for the ad"),
    adId: z.string(),
    customerId: z.string(),
    resourceName: z.string().describe("Ad resource name for use with generateAdPreview API (customers/{customerId}/ads/{adId})"),
  })
  .describe("Google Ads ad entity data. Use resourceName with the Google Ads generateAdPreview API to obtain an HTML preview.");

type GetAdPreviewInput = z.infer<typeof GetAdPreviewInputSchema>;
type GetAdPreviewOutput = z.infer<typeof GetAdPreviewOutputSchema>;

interface GAdsAdRow {
  ad?: {
    id?: string;
    type?: string;
    finalUrls?: string[];
    resourceName?: string;
  };
}

export async function getAdPreviewLogic(
  input: GetAdPreviewInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetAdPreviewOutput> {
  const { gadsService } = resolveSessionServices(sdkContext);

  // Use getEntity which wraps gaqlSearch with buildGetByIdQuery for the "ad" entity type
  const row = (await gadsService.getEntity(
    "ad" as GAdsEntityType,
    input.customerId,
    input.adId,
    context
  )) as GAdsAdRow;

  const ad = row?.ad;
  const resourceName = ad?.resourceName ?? `customers/${input.customerId}/ads/${input.adId}`;

  return {
    adType: ad?.type,
    finalUrls: ad?.finalUrls,
    adId: input.adId,
    customerId: input.customerId,
    resourceName,
  };
}

export function getAdPreviewResponseFormatter(result: GetAdPreviewOutput): McpTextContent[] {
  const lines: string[] = [
    "Google Ads Ad Preview",
    "",
    `Ad ID: ${result.adId}`,
    `Customer ID: ${result.customerId}`,
  ];

  if (result.adType) lines.push(`Ad Type: ${result.adType}`);
  if (result.resourceName) lines.push(`Resource Name: ${result.resourceName}`);
  if (result.finalUrls && result.finalUrls.length > 0) {
    lines.push(`Final URLs: ${result.finalUrls.join(", ")}`);
  }
  lines.push("", `Use resourceName with the Google Ads generateAdPreview API for an HTML render.`);

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
      label: "Preview a Google Ads ad",
      input: {
        customerId: "1234567890",
        adId: "987654321",
      },
    },
  ],
  logic: getAdPreviewLogic,
  responseFormatter: getAdPreviewResponseFormatter,
};
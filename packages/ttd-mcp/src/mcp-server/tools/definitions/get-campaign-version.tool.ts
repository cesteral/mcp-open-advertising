// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { McpTextContent, RequestContext, SdkContext } from "@cesteral/shared";

const TOOL_NAME = "ttd_get_campaign_version";
const TOOL_TITLE = "TTD Get Campaign Version";
const TOOL_DESCRIPTION = `Get a campaign's Workflows version payload.

This is useful for debugging campaign workflow state and comparing versions across updates.`;

export const GetCampaignVersionInputSchema = z.object({
  campaignId: z.string().min(1).describe("Campaign ID to retrieve version info for"),
});

export const GetCampaignVersionOutputSchema = z.object({
  campaignVersion: z.record(z.unknown()).describe("Raw campaign version payload"),
  timestamp: z.string().datetime(),
});

type GetCampaignVersionInput = z.infer<typeof GetCampaignVersionInputSchema>;
type GetCampaignVersionOutput = z.infer<typeof GetCampaignVersionOutputSchema>;

export async function getCampaignVersionLogic(
  input: GetCampaignVersionInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetCampaignVersionOutput> {
  const { ttdService } = resolveSessionServices(sdkContext);
  const campaignVersion = (await ttdService.getCampaignVersion(
    input.campaignId,
    context
  )) as Record<string, unknown>;
  return { campaignVersion, timestamp: new Date().toISOString() };
}

export function getCampaignVersionResponseFormatter(
  result: GetCampaignVersionOutput
): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Campaign version:\n\n${JSON.stringify(result.campaignVersion, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const getCampaignVersionTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: GetCampaignVersionInputSchema,
  outputSchema: GetCampaignVersionOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    destructiveHint: false,
    idempotentHint: true,
  },
  inputExamples: [
    {
      label: "Get campaign version",
      input: {
        campaignId: "camp123",
      },
    },
  ],
  logic: getCampaignVersionLogic,
  responseFormatter: getCampaignVersionResponseFormatter,
};

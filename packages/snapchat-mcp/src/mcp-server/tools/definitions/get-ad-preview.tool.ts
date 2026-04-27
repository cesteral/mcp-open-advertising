// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "snapchat_get_ad_preview";
const TOOL_TITLE = "Get Snapchat Creative Preview";
const TOOL_DESCRIPTION = `Get a preview of how a Snapchat creative will appear to users.

Returns the documented creative preview payload from Snapchat's
\`/v1/creatives/{creative_id}/creative_preview\` endpoint.`;

export const GetAdPreviewInputSchema = z
  .object({
    creativeId: z.string().min(1).describe("The creative ID to preview"),
  })
  .describe("Parameters for getting a Snapchat creative preview");

export const GetAdPreviewOutputSchema = z
  .object({
    preview: z.record(z.any()).describe("Ad preview data from Snapchat"),
    creativeId: z.string(),
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
  const { snapchatService } = resolveSessionServices(sdkContext);

  const preview = await snapchatService.getCreativePreview(input.creativeId, context);

  return {
    preview: preview as Record<string, unknown>,
    creativeId: input.creativeId,
    timestamp: new Date().toISOString(),
  };
}

export function getAdPreviewResponseFormatter(result: GetAdPreviewOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Creative preview for ${result.creativeId}:\n${JSON.stringify(result.preview, null, 2)}\n\nTimestamp: ${result.timestamp}`,
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
      label: "Preview a Snapchat creative",
      input: {
        creativeId: "1600123456789",
      },
    },
  ],
  logic: getAdPreviewLogic,
  responseFormatter: getAdPreviewResponseFormatter,
};

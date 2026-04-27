// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { downloadFileToBuffer } from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "dv360_upload_video";
const TOOL_TITLE = "Upload Video to DV360";
const TOOL_DESCRIPTION = `Upload a video asset to a DV360 advertiser from a URL.

The server downloads the video and uploads it via the DV360 asset upload API.
DV360 uses the same /assets endpoint for both images and videos.
Returns the assetId which can be used when creating video creatives.

**Video requirements:**
- Formats: MP4, MOV, AVI, WEBM
- Check DV360 creative specs for duration/size requirements per creative type

**Usage:** The returned assetId is used when creating or updating DV360 video creatives.`;

export const UploadVideoInputSchema = z
  .object({
    advertiserId: z.string().describe("DV360 Advertiser ID"),
    mediaUrl: z.string().url().describe("Publicly accessible URL of the video to upload"),
    displayName: z.string().optional().describe("Optional display name for the uploaded asset"),
  })
  .describe("Parameters for uploading a video to DV360");

export const UploadVideoOutputSchema = z
  .object({
    assetId: z.string().describe("DV360 asset media ID for use in creative payloads"),
    displayName: z.string().describe("Asset display name"),
    uploadedAt: z.string().datetime(),
  })
  .describe("Uploaded video asset info");

type UploadVideoInput = z.infer<typeof UploadVideoInputSchema>;
type UploadVideoOutput = z.infer<typeof UploadVideoOutputSchema>;

export async function uploadVideoLogic(
  input: UploadVideoInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<UploadVideoOutput> {
  const { dv360Service } = resolveSessionServices(sdkContext);

  const { buffer, contentType, filename } = await downloadFileToBuffer(
    input.mediaUrl,
    300_000, // 5 min timeout for large videos
    context
  );

  const effectiveName = input.displayName ?? filename;

  const result = await dv360Service.uploadAsset(
    input.advertiserId,
    buffer,
    effectiveName,
    contentType,
    context
  );

  return {
    assetId: result.asset.mediaId,
    displayName: effectiveName,
    uploadedAt: new Date().toISOString(),
  };
}

export function uploadVideoResponseFormatter(result: UploadVideoOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: [
        "Video uploaded to DV360!",
        "",
        `Asset ID: ${result.assetId}`,
        `Display Name: ${result.displayName}`,
        `Uploaded: ${result.uploadedAt}`,
        "",
        "Use assetId when creating or updating DV360 video creatives.",
      ].join("\n"),
    },
  ];
}

export const uploadVideoTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: UploadVideoInputSchema,
  outputSchema: UploadVideoOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: true,
    idempotentHint: false,
    destructiveHint: true,
  },
  inputExamples: [
    {
      label: "Upload a campaign video",
      input: {
        advertiserId: "1234567890",
        mediaUrl: "https://example.com/campaign-video.mp4",
        displayName: "Summer Sale 2025 Video",
      },
    },
  ],
  logic: uploadVideoLogic,
  responseFormatter: uploadVideoResponseFormatter,
};

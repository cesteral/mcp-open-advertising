// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { downloadFileToBuffer } from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "snapchat_upload_video";
const TOOL_TITLE = "Upload Video to Snapchat Ads";
const TOOL_DESCRIPTION = `Upload a video to Snapchat Ads Library from a URL.

The server downloads the video and uploads it to Snapchat's media library.
Polls until processing is complete (up to 10 minutes).

**Video requirements:**
- Formats: MP4, MOV (H.264 codec recommended)
- Max file size: 1GB
- Min resolution: 540x960px (9:16), 640x640px (1:1)
- Duration: 3 to 180 seconds

**Usage:** The returned mediaId is used in creative payloads.`;

export const UploadVideoInputSchema = z.object({
  adAccountId: z.string().describe("Snapchat Ad Account ID"),
  mediaUrl: z.string().url().describe("Publicly accessible URL of the video to upload"),
  name: z.string().optional().describe("Optional name for the video in the library"),
}).describe("Parameters for uploading a video to Snapchat");

export const UploadVideoOutputSchema = z.object({
  mediaId: z.string().describe("Media ID for use in creative payloads"),
  mediaStatus: z.string().optional().describe("Final media processing status"),
  uploadedAt: z.string().datetime(),
}).describe("Uploaded Snapchat video info");

type UploadVideoInput = z.infer<typeof UploadVideoInputSchema>;
type UploadVideoOutput = z.infer<typeof UploadVideoOutputSchema>;

interface SnapchatMediaItem {
  id?: string;
  media_status?: string;
}

interface SnapchatMediaUploadResponse {
  request_status?: string;
  media?: Array<{
    sub_request_status?: string;
    media?: SnapchatMediaItem;
  }>;
}

interface SnapchatMediaGetResponse {
  request_status?: string;
  media?: Array<{
    sub_request_status?: string;
    media?: SnapchatMediaItem;
  }>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function uploadVideoLogic(
  input: UploadVideoInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<UploadVideoOutput> {
  const { snapchatService } = resolveSessionServices(sdkContext);

  const { buffer, contentType, filename } = await downloadFileToBuffer(
    input.mediaUrl,
    600_000, // 10 min for large videos
    context
  );

  const fields: Record<string, string> = {
    upload_type: "VIDEO",
    ad_account_id: input.adAccountId,
    name: input.name ?? filename,
  };

  const uploadResult = await snapchatService.client.postMultipart(
    "/v1/media",
    fields,
    "file",
    buffer,
    filename,
    contentType,
    context
  ) as SnapchatMediaUploadResponse;

  const mediaItem = uploadResult.media?.[0]?.media;
  const mediaId = mediaItem?.id;
  if (!mediaId) {
    throw new Error("Snapchat video upload failed: no media id returned");
  }

  // Poll for READY status (max 10 min, 20s intervals)
  const maxAttempts = 30;
  const pollIntervalMs = 20_000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await sleep(pollIntervalMs);

    const statusResult = await snapchatService.client.get(
      `/v1/media/${mediaId}`,
      undefined,
      context
    ) as SnapchatMediaGetResponse;

    const statusItem = statusResult.media?.[0]?.media;
    const mediaStatus = statusItem?.media_status ?? "PENDING";

    if (mediaStatus === "READY") {
      return {
        mediaId,
        mediaStatus,
        uploadedAt: new Date().toISOString(),
      };
    }

    if (mediaStatus === "FAILED") {
      throw new Error(`Snapchat video processing failed: status=${mediaStatus}`);
    }
  }

  // Return mediaId even if polling timed out — video may still be processing
  return {
    mediaId,
    uploadedAt: new Date().toISOString(),
  };
}

export function uploadVideoResponseFormatter(result: UploadVideoOutput): McpTextContent[] {
  return [{
    type: "text" as const,
    text: `Video uploaded to Snapchat!\n\nMedia ID: ${result.mediaId}${result.mediaStatus ? `\nStatus: ${result.mediaStatus}` : ""}\n\nUse mediaId in your creative payload`,
  }];
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
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Upload a Snapchat campaign video",
      input: {
        adAccountId: "1234567890",
        mediaUrl: "https://example.com/video.mp4",
        name: "Summer Campaign 2025",
      },
    },
  ],
  logic: uploadVideoLogic,
  responseFormatter: uploadVideoResponseFormatter,
};
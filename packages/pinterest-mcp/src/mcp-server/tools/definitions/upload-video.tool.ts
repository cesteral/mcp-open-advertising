// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { downloadFileToBuffer } from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "pinterest_upload_video";
const TOOL_TITLE = "Upload Video to Pinterest Ads";
const TOOL_DESCRIPTION = `Upload a video to Pinterest Ads Library from a URL.

The server downloads the video and uploads it to Pinterest's ad media library.
Polls until processing is complete (up to 10 minutes).

**Video requirements:**
- Formats: MP4, MOV (H.264 codec recommended)
- Max file size: 500MB
- Min resolution: 240px on shortest side
- Duration: 2 to 60 seconds for standard ads

**Usage:** The returned mediaId is used in ad creative payloads.`;

export const UploadVideoInputSchema = z.object({
  adAccountId: z.string().describe("Pinterest Ad Account ID"),
  mediaUrl: z.string().url().describe("Publicly accessible URL of the video to upload"),
  videoName: z.string().optional().describe("Optional name for the video in the library"),
}).describe("Parameters for uploading a video to Pinterest");

export const UploadVideoOutputSchema = z.object({
  mediaId: z.string().describe("Media ID for use in ad creative payloads"),
  mediaStatus: z.string().optional().describe("Final media processing status"),
  uploadedAt: z.string().datetime(),
}).describe("Uploaded Pinterest video info");

type UploadVideoInput = z.infer<typeof UploadVideoInputSchema>;
type UploadVideoOutput = z.infer<typeof UploadVideoOutputSchema>;

interface PinterestMediaUploadResponse {
  media_id?: string;
  media_type?: string;
}

interface PinterestMediaStatusResponse {
  media_id?: string;
  media_processing_record?: {
    status?: string;
  };
  media_type?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function uploadVideoLogic(
  input: UploadVideoInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<UploadVideoOutput> {
  const { pinterestService } = resolveSessionServices(sdkContext);

  const adAccountId = pinterestService.client.accountId;

  const { buffer, contentType, filename } = await downloadFileToBuffer(
    input.mediaUrl,
    600_000, // 10 min for large videos
    context
  );

  const uploadResult = await pinterestService.client.postMultipart(
    `/v5/ad_accounts/${adAccountId}/media`,
    {},
    "file",
    buffer,
    input.videoName ?? filename,
    contentType,
    context
  ) as PinterestMediaUploadResponse;

  const mediaId = uploadResult.media_id;
  if (!mediaId) {
    throw new Error("Pinterest video upload failed: no media_id returned");
  }

  // Poll for processing status (max 10 min, 20s intervals)
  const maxAttempts = 30;
  const pollIntervalMs = 20_000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await sleep(pollIntervalMs);

    const statusResult = await pinterestService.client.get(
      `/v5/ad_accounts/${adAccountId}/media/${mediaId}`,
      undefined,
      context
    ) as PinterestMediaStatusResponse;

    const status = statusResult.media_processing_record?.status ?? "processing";

    if (status === "succeeded" || status === "SUCCEEDED") {
      return {
        mediaId,
        mediaStatus: status,
        uploadedAt: new Date().toISOString(),
      };
    }

    if (status === "failed" || status === "FAILED") {
      throw new Error(`Pinterest video processing failed: status=${status}`);
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
    text: `Video uploaded to Pinterest!\n\nMedia ID: ${result.mediaId}${result.mediaStatus ? `\nStatus: ${result.mediaStatus}` : ""}\n\nUse mediaId in your ad creative payload`,
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
      label: "Upload a Pinterest campaign video",
      input: {
        adAccountId: "1234567890",
        mediaUrl: "https://example.com/video.mp4",
        videoName: "Summer Campaign 2025",
      },
    },
  ],
  logic: uploadVideoLogic,
  responseFormatter: uploadVideoResponseFormatter,
};
// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
  downloadFileToBuffer,
  McpError,
  JsonRpcErrorCode,
  pollUntilComplete,
  ReportTimeoutError,
  ReportFailedError,
} from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";
import type {
  SnapchatMediaUploadResponse,
  SnapchatMediaGetResponse,
} from "../utils/media-types.js";
import { mcpConfig } from "../../../config/index.js";

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

export const UploadVideoInputSchema = z
  .object({
    adAccountId: z.string().describe("Snapchat Ad Account ID"),
    mediaUrl: z.string().url().describe("Publicly accessible URL of the video to upload"),
    name: z.string().optional().describe("Optional name for the video in the library"),
  })
  .describe("Parameters for uploading a video to Snapchat");

export const UploadVideoOutputSchema = z
  .object({
    mediaId: z.string().describe("Media ID for use in creative payloads"),
    mediaStatus: z.string().optional().describe("Final media processing status"),
    uploadedAt: z.string().datetime(),
  })
  .describe("Uploaded Snapchat video info");

type UploadVideoInput = z.infer<typeof UploadVideoInputSchema>;
type UploadVideoOutput = z.infer<typeof UploadVideoOutputSchema>;


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

  // Step 1: Create the media entity
  const createResult = (await snapchatService.client.post(
    `/v1/adaccounts/${input.adAccountId}/media`,
    {
      media: [
        {
          name: input.name ?? filename,
          type: "VIDEO",
          ad_account_id: input.adAccountId,
        },
      ],
    },
    context
  )) as SnapchatMediaUploadResponse;

  const mediaItem = createResult.media?.[0]?.media;
  const mediaId = mediaItem?.id;
  if (!mediaId) {
    throw new McpError(JsonRpcErrorCode.InternalError, "Snapchat video upload failed: no media id returned from create step");
  }

  // Step 2: Upload the binary
  await snapchatService.client.postMultipart(
    `/v1/media/${mediaId}/upload`,
    {},
    "file",
    buffer,
    filename,
    contentType,
    context
  );

  // Poll for READY status
  try {
    const finalStatus = await pollUntilComplete<string>({
      fetchStatus: async () => {
        const statusResult = (await snapchatService.client.get(
          `/v1/media/${mediaId}`,
          undefined,
          context
        )) as SnapchatMediaGetResponse;
        return statusResult.media?.[0]?.media?.media_status ?? "PENDING";
      },
      isComplete: (s) => s === "READY",
      isFailed: (s) => s === "FAILED",
      initialDelayMs: mcpConfig.snapchatVideoUploadPollIntervalMs,
      maxDelayMs: mcpConfig.snapchatVideoUploadPollIntervalMs,
      maxAttempts: mcpConfig.snapchatVideoUploadMaxPollAttempts,
      backoffFactor: 1,
    });
    return { mediaId, mediaStatus: finalStatus, uploadedAt: new Date().toISOString() };
  } catch (error) {
    if (error instanceof ReportFailedError) {
      throw new McpError(
        JsonRpcErrorCode.InternalError,
        `Snapchat video processing failed: status=${String(error.status)}`
      );
    }
    if (error instanceof ReportTimeoutError) {
      // Polling timed out — return mediaId so caller can re-check later
      return { mediaId, uploadedAt: new Date().toISOString() };
    }
    throw error;
  }
}

export function uploadVideoResponseFormatter(result: UploadVideoOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Video uploaded to Snapchat!\n\nMedia ID: ${result.mediaId}${result.mediaStatus ? `\nStatus: ${result.mediaStatus}` : ""}\n\nUse mediaId in your creative payload`,
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

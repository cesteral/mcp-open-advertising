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
import { mcpConfig } from "../../../config/index.js";
import type {
  PinterestMediaRegisterResponse,
  PinterestMediaStatusResponse,
} from "../utils/media-types.js";

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

export const UploadVideoInputSchema = z
  .object({
    adAccountId: z.string().describe("Pinterest Ad Account ID"),
    mediaUrl: z.string().url().describe("Publicly accessible URL of the video to upload"),
    videoName: z.string().optional().describe("Optional name for the video in the library"),
  })
  .describe("Parameters for uploading a video to Pinterest");

export const UploadVideoOutputSchema = z
  .object({
    mediaId: z.string().describe("Media ID for use in ad creative payloads"),
    mediaStatus: z.string().optional().describe("Final media processing status"),
    uploadedAt: z.string().datetime(),
  })
  .describe("Uploaded Pinterest video info");

type UploadVideoInput = z.infer<typeof UploadVideoInputSchema>;
type UploadVideoOutput = z.infer<typeof UploadVideoOutputSchema>;


export async function uploadVideoLogic(
  input: UploadVideoInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<UploadVideoOutput> {
  const { pinterestService } = resolveSessionServices(sdkContext);

  const { buffer, contentType, filename } = await downloadFileToBuffer(
    input.mediaUrl,
    600_000, // 10 min for large videos
    context
  );

  // Step 1: Register the upload with Pinterest to get a pre-signed S3 URL
  const registration = (await pinterestService.client.post(
    "/v5/media",
    { media_type: "video" },
    context
  )) as PinterestMediaRegisterResponse;

  const mediaId = registration.media_id;
  if (!mediaId || !registration.upload_url) {
    throw new McpError(JsonRpcErrorCode.InternalError, "Pinterest video upload registration failed: missing media_id or upload_url");
  }

  // Step 2: Upload the file to S3 using the pre-signed URL and parameters
  await pinterestService.client.uploadToS3(
    registration.upload_url,
    registration.upload_parameters ?? {},
    buffer,
    input.videoName ?? filename,
    contentType,
    context
  );

  // Poll for processing status
  try {
    const finalStatus = await pollUntilComplete<string>({
      fetchStatus: async () => {
        const statusResult = (await pinterestService.client.get(
          `/v5/media/${mediaId}`,
          undefined,
          context
        )) as PinterestMediaStatusResponse;
        return statusResult.media_processing_record?.status ?? "processing";
      },
      isComplete: (s) => s === "succeeded" || s === "SUCCEEDED",
      isFailed: (s) => s === "failed" || s === "FAILED",
      initialDelayMs: mcpConfig.pinterestVideoUploadPollIntervalMs,
      maxDelayMs: mcpConfig.pinterestVideoUploadPollIntervalMs,
      maxAttempts: mcpConfig.pinterestVideoUploadMaxPollAttempts,
      backoffFactor: 1,
    });
    return { mediaId, mediaStatus: finalStatus, uploadedAt: new Date().toISOString() };
  } catch (error) {
    if (error instanceof ReportFailedError) {
      throw new McpError(
        JsonRpcErrorCode.InternalError,
        `Pinterest video processing failed: status=${String(error.status)}`
      );
    }
    if (error instanceof ReportTimeoutError) {
      // Polling timed out — video may still be processing
      return { mediaId, uploadedAt: new Date().toISOString() };
    }
    throw error;
  }
}

export function uploadVideoResponseFormatter(result: UploadVideoOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Video uploaded to Pinterest!\n\nMedia ID: ${result.mediaId}${result.mediaStatus ? `\nStatus: ${result.mediaStatus}` : ""}\n\nUse mediaId in your ad creative payload`,
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

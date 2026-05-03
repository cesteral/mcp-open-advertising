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

const TOOL_NAME = "snapchat_upload_image";
const TOOL_TITLE = "Upload Image to Snapchat Ads";
const TOOL_DESCRIPTION = `Upload an image to Snapchat Ads Library from a URL.

The server downloads the image and uploads it to Snapchat's media library.
Returns the mediaId for use in creative payloads.

**Image requirements:**
- Formats: JPEG, PNG
- Max file size: 5MB
- Recommended dimensions: 1080x1920px (9:16 vertical), 1080x1080px (1:1)

**Usage:** The returned mediaId is used in creative payloads.`;

export const UploadImageInputSchema = z
  .object({
    adAccountId: z.string().describe("Snapchat Ad Account ID"),
    mediaUrl: z.string().url().describe("Publicly accessible URL of the image to upload"),
    name: z.string().optional().describe("Name for the media in the library"),
  })
  .describe("Parameters for uploading an image to Snapchat");

export const UploadImageOutputSchema = z
  .object({
    mediaId: z.string().describe("Media ID for use in creative payloads"),
    mediaStatus: z.string().optional().describe("Media processing status"),
    uploadedAt: z.string().datetime(),
  })
  .describe("Uploaded Snapchat image info");

type UploadImageInput = z.infer<typeof UploadImageInputSchema>;
type UploadImageOutput = z.infer<typeof UploadImageOutputSchema>;


export async function uploadImageLogic(
  input: UploadImageInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<UploadImageOutput> {
  const { snapchatService } = resolveSessionServices(sdkContext);

  const { buffer, contentType, filename } = await downloadFileToBuffer(
    input.mediaUrl,
    120_000,
    context
  );

  // Step 1: Create the media entity
  const createResult = (await snapchatService.client.post(
    `/v1/adaccounts/${input.adAccountId}/media`,
    {
      media: [
        {
          name: input.name ?? filename,
          type: "IMAGE",
          ad_account_id: input.adAccountId,
        },
      ],
    },
    context
  )) as SnapchatMediaUploadResponse;

  const createdItem = createResult.media?.[0]?.media;
  const mediaId = createdItem?.id;
  if (!mediaId) {
    throw new McpError(JsonRpcErrorCode.InternalError, "Snapchat image upload failed: no media id returned from create step");
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

  // Step 3: Poll for READY status
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
        `Snapchat image processing failed: status=${String(error.status)}`
      );
    }
    if (error instanceof ReportTimeoutError) {
      throw new McpError(
        JsonRpcErrorCode.Timeout,
        `Snapchat image processing timed out before media reached READY status: mediaId=${mediaId}`,
        {
          mediaId,
          nextAction: "Retry later by checking the Snapchat media status, then use the mediaId only after status is READY.",
        },
        { cause: error }
      );
    }
    throw error;
  }
}

export function uploadImageResponseFormatter(result: UploadImageOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Image uploaded to Snapchat!\n\nMedia ID: ${result.mediaId}${result.mediaStatus ? `\nStatus: ${result.mediaStatus}` : ""}\n\nUse mediaId in your creative payload`,
    },
  ];
}

export const uploadImageTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: UploadImageInputSchema,
  outputSchema: UploadImageOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: true,
    idempotentHint: false,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Upload a Snapchat ad image",
      input: {
        adAccountId: "1234567890",
        mediaUrl: "https://example.com/banner.jpg",
        name: "Summer Banner",
      },
    },
  ],
  logic: uploadImageLogic,
  responseFormatter: uploadImageResponseFormatter,
};

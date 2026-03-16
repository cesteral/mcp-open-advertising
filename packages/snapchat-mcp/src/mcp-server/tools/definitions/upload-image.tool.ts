// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { downloadFileToBuffer } from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";
import type { SnapchatMediaUploadResponse } from "../utils/media-types.js";

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

export const UploadImageInputSchema = z.object({
  adAccountId: z.string().describe("Snapchat Ad Account ID"),
  mediaUrl: z.string().url().describe("Publicly accessible URL of the image to upload"),
  name: z.string().optional().describe("Name for the media in the library"),
}).describe("Parameters for uploading an image to Snapchat");

export const UploadImageOutputSchema = z.object({
  mediaId: z.string().describe("Media ID for use in creative payloads"),
  mediaStatus: z.string().optional().describe("Media processing status"),
  uploadedAt: z.string().datetime(),
}).describe("Uploaded Snapchat image info");

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

  const fields: Record<string, string> = {
    upload_type: "IMAGE",
    ad_account_id: input.adAccountId,
    name: input.name ?? filename,
  };

  const result = await snapchatService.client.postMultipart(
    "/v1/media",
    fields,
    "file",
    buffer,
    filename,
    contentType,
    context
  ) as SnapchatMediaUploadResponse;

  const mediaItem = result.media?.[0]?.media;
  const mediaId = mediaItem?.id;
  if (!mediaId) {
    throw new Error("Snapchat image upload failed: no media id returned");
  }

  return {
    mediaId,
    mediaStatus: mediaItem?.media_status,
    uploadedAt: new Date().toISOString(),
  };
}

export function uploadImageResponseFormatter(result: UploadImageOutput): McpTextContent[] {
  return [{
    type: "text" as const,
    text: `Image uploaded to Snapchat!\n\nMedia ID: ${result.mediaId}${result.mediaStatus ? `\nStatus: ${result.mediaStatus}` : ""}\n\nUse mediaId in your creative payload`,
  }];
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
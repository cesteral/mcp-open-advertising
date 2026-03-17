// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { downloadFileToBuffer } from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";
import type { PinterestMediaUploadResponse } from "../utils/media-types.js";

const TOOL_NAME = "pinterest_upload_image";
const TOOL_TITLE = "Upload Image to Pinterest Ads";
const TOOL_DESCRIPTION = `Upload an image to Pinterest Ads Library from a URL.

The server downloads the image and uploads it to Pinterest's ad media library.
Returns the mediaId for use in ad creatives.

**Image requirements:**
- Formats: JPEG, PNG
- Max file size: 100KB (for feed ads), 500KB (for other placements)
- Recommended dimensions: 1200x628px, 1080x1080px, 720x1280px

**Usage:** The returned mediaId is used in ad creative payloads.`;

export const UploadImageInputSchema = z.object({
  adAccountId: z.string().describe("Pinterest Ad Account ID"),
  mediaUrl: z.string().url().describe("Publicly accessible URL of the image to upload"),
  filename: z.string().optional().describe("Override filename (otherwise derived from URL)"),
}).describe("Parameters for uploading an image to Pinterest");

export const UploadImageOutputSchema = z.object({
  mediaId: z.string().describe("Media ID for use in ad creative payloads"),
  mediaType: z.string().optional().describe("Media type"),
  uploadedAt: z.string().datetime(),
}).describe("Uploaded Pinterest image info");

type UploadImageInput = z.infer<typeof UploadImageInputSchema>;
type UploadImageOutput = z.infer<typeof UploadImageOutputSchema>;

export async function uploadImageLogic(
  input: UploadImageInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<UploadImageOutput> {
  const { pinterestService } = resolveSessionServices(sdkContext);

  const adAccountId = pinterestService.client.accountId;

  const { buffer, contentType, filename } = await downloadFileToBuffer(
    input.mediaUrl,
    120_000,
    context
  );

  const effectiveFilename = input.filename ?? filename;

  const result = await pinterestService.client.postMultipart(
    `/v5/ad_accounts/${adAccountId}/media`,
    {},
    "file",
    buffer,
    effectiveFilename,
    contentType,
    context
  ) as PinterestMediaUploadResponse;

  const mediaId = result.media_id;
  if (!mediaId) {
    throw new Error("Pinterest image upload failed: no media_id returned");
  }

  return {
    mediaId,
    mediaType: result.media_type,
    uploadedAt: new Date().toISOString(),
  };
}

export function uploadImageResponseFormatter(result: UploadImageOutput): McpTextContent[] {
  return [{
    type: "text" as const,
    text: `Image uploaded to Pinterest!\n\nMedia ID: ${result.mediaId}${result.mediaType ? `\nMedia Type: ${result.mediaType}` : ""}\n\nUse mediaId in your ad creative payload`,
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
      label: "Upload a Pinterest ad image",
      input: {
        adAccountId: "1234567890",
        mediaUrl: "https://example.com/banner.jpg",
      },
    },
  ],
  logic: uploadImageLogic,
  responseFormatter: uploadImageResponseFormatter,
};
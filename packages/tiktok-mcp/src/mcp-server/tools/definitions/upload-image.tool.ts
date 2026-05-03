// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { downloadFileToBuffer,
  McpError,
  JsonRpcErrorCode,
} from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "tiktok_upload_image";
const TOOL_TITLE = "Upload Image to TikTok Ads";
const TOOL_DESCRIPTION = `Upload an image to TikTok Ads Library from a URL.

The server downloads the image and uploads it to TikTok's ad image library.
Returns the imageId for use in ad creatives.

**Image requirements:**
- Formats: JPEG, PNG
- Max file size: 100KB (for feed ads), 500KB (for other placements)
- Recommended dimensions: 1200x628px, 1080x1080px, 720x1280px

**Usage:** The returned imageId is used in ad creative payloads.`;

export const UploadImageInputSchema = z
  .object({
    advertiserId: z
      .string()
      .describe(
        "TikTok Advertiser ID (informational — the session-bound advertiser from authentication is used for API calls)"
      ),
    mediaUrl: z.string().url().describe("Publicly accessible URL of the image to upload"),
    filename: z.string().optional().describe("Override filename (otherwise derived from URL)"),
  })
  .describe("Parameters for uploading an image to TikTok");

export const UploadImageOutputSchema = z
  .object({
    imageId: z.string().describe("Image ID for use in ad creative payloads"),
    url: z.string().optional().describe("Preview URL of the uploaded image"),
    size: z.number().optional().describe("File size in bytes"),
    uploadedAt: z.string().datetime(),
  })
  .describe("Uploaded TikTok image info");

type UploadImageInput = z.infer<typeof UploadImageInputSchema>;
type UploadImageOutput = z.infer<typeof UploadImageOutputSchema>;

interface TikTokImageUploadResponse {
  image_id?: string;
  image_url?: string;
  size?: number;
}

export async function uploadImageLogic(
  input: UploadImageInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<UploadImageOutput> {
  const { tiktokService } = resolveSessionServices(sdkContext);

  const { buffer, contentType, filename } = await downloadFileToBuffer(
    input.mediaUrl,
    120_000,
    context
  );

  const effectiveFilename = input.filename ?? filename;

  const result = (await tiktokService.client.postMultipart(
    tiktokService.client.versionedPath("file/image/ad/upload/"),
    {},
    "image_file",
    buffer,
    effectiveFilename,
    contentType,
    context
  )) as TikTokImageUploadResponse;

  const imageId = result.image_id;
  if (!imageId) {
    throw new McpError(JsonRpcErrorCode.InternalError, "TikTok image upload failed: no image_id returned");
  }

  return {
    imageId,
    url: result.image_url,
    size: result.size,
    uploadedAt: new Date().toISOString(),
  };
}

export function uploadImageResponseFormatter(result: UploadImageOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Image uploaded to TikTok!\n\nImage ID: ${result.imageId}${result.url ? `\nPreview URL: ${result.url}` : ""}${result.size !== undefined ? `\nSize: ${result.size} bytes` : ""}\n\nUse imageId in your ad creative payload`,
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
      label: "Upload a TikTok ad image",
      input: {
        advertiserId: "1234567890",
        mediaUrl: "https://example.com/banner.jpg",
      },
    },
  ],
  logic: uploadImageLogic,
  responseFormatter: uploadImageResponseFormatter,
};

// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { downloadFileToBuffer } from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "meta_upload_image";
const TOOL_TITLE = "Upload Image to Meta Ads";
const TOOL_DESCRIPTION = `Upload an image to Meta Ads Library from a URL.

The server downloads the image and uploads it to Meta's ad image library.
Returns the image hash which can be used in ad creative payloads.

**Image requirements:**
- Formats: JPEG, PNG, GIF
- Max file size: 30MB
- Recommended: 1200x628px (1.91:1 ratio) for link ads
- Square 1080x1080px for Stories/Reels

**Usage:** The returned imageHash is used in adCreative → object_story_spec → link_data → image_hash`;

export const UploadImageInputSchema = z.object({
  adAccountId: z.string().describe("Meta Ad Account ID (e.g., act_1234567890)"),
  mediaUrl: z.string().url().describe("Publicly accessible URL of the image to upload"),
  name: z.string().optional().describe("Optional name for the image in Media Library"),
}).describe("Parameters for uploading an image to Meta");

export const UploadImageOutputSchema = z.object({
  imageHash: z.string().describe("Image hash used in ad creative payloads"),
  name: z.string().describe("Image name in Media Library"),
  url: z.string().optional().describe("Preview URL of the uploaded image"),
  uploadedAt: z.string().datetime(),
}).describe("Uploaded image info");

type UploadImageInput = z.infer<typeof UploadImageInputSchema>;
type UploadImageOutput = z.infer<typeof UploadImageOutputSchema>;

interface MetaImageUploadResponse {
  images?: {
    [filename: string]: {
      hash: string;
      url: string;
      name?: string;
    };
  };
}

export async function uploadImageLogic(
  input: UploadImageInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<UploadImageOutput> {
  const { metaService } = resolveSessionServices(sdkContext);

  const { buffer, contentType, filename } = await downloadFileToBuffer(
    input.mediaUrl,
    120_000,
    context
  );

  const effectiveName = input.name ?? filename;
  const fields: Record<string, string> = {};
  if (input.name) fields.name = input.name;

  const result = await metaService.graphApiClient.postMultipart(
    `/${input.adAccountId}/adimages`,
    fields,
    "bytes",
    buffer,
    effectiveName,
    contentType,
    context
  ) as MetaImageUploadResponse;

  const images = result.images ?? {};
  const imageEntry = Object.values(images)[0];
  if (!imageEntry) {
    throw new Error("Meta image upload failed: no image data returned");
  }

  return {
    imageHash: imageEntry.hash,
    name: imageEntry.name ?? effectiveName,
    url: imageEntry.url,
    uploadedAt: new Date().toISOString(),
  };
}

export function uploadImageResponseFormatter(result: UploadImageOutput): McpTextContent[] {
  return [{
    type: "text" as const,
    text: `Image uploaded to Meta!\n\nImage Hash: ${result.imageHash}\nName: ${result.name}${result.url ? `\nPreview URL: ${result.url}` : ""}\n\nUse imageHash in adCreative.object_story_spec.link_data.image_hash`,
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
      label: "Upload a banner image",
      input: {
        adAccountId: "act_1234567890",
        mediaUrl: "https://example.com/banner-1200x628.jpg",
        name: "Summer Sale Banner",
      },
    },
  ],
  logic: uploadImageLogic,
  responseFormatter: uploadImageResponseFormatter,
};
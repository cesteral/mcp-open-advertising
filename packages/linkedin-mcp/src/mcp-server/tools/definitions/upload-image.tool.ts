// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { downloadFileToBuffer } from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";
import type { LinkedInRegisterUploadResponse } from "../utils/media-types.js";

const TOOL_NAME = "linkedin_upload_image";
const TOOL_TITLE = "Upload Image to LinkedIn Ads";
const TOOL_DESCRIPTION = `Upload an image to LinkedIn Ads from a URL.

The server downloads the image and uploads it to LinkedIn's Digital Media Assets library.
Uses LinkedIn's 3-step upload flow: register → upload binary → confirm.

**Image requirements:**
- Formats: JPEG, PNG, GIF
- Min: 400x400px (Sponsored Content), recommended 1200x627px
- Max file size: 5MB
- Aspect ratios: 1.91:1 (horizontal), 1:1 (square), 2:3 (vertical)

**Usage:** The returned assetUrn is referenced in creative → content → media → reference`;

export const UploadImageInputSchema = z.object({
  adAccountUrn: z.string().describe("LinkedIn Ad Account URN (e.g., urn:li:sponsoredAccount:123456)"),
  mediaUrl: z.string().url().describe("Publicly accessible URL of the image to upload"),
  filename: z.string().optional().describe("Override filename"),
}).describe("Parameters for uploading an image to LinkedIn");

export const UploadImageOutputSchema = z.object({
  assetUrn: z.string().describe("Asset URN (urn:li:digitalmediaAsset:...) for use in creative payloads"),
  uploadedAt: z.string().datetime(),
}).describe("Uploaded LinkedIn image asset");

type UploadImageInput = z.infer<typeof UploadImageInputSchema>;
type UploadImageOutput = z.infer<typeof UploadImageOutputSchema>;

export async function uploadImageLogic(
  input: UploadImageInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<UploadImageOutput> {
  const { linkedInService } = resolveSessionServices(sdkContext);

  // Step 1: Register upload
  const registerPayload = {
    registerUploadRequest: {
      owner: input.adAccountUrn,
      recipes: ["urn:li:digitalmediaRecipe:ads-image"],
      serviceRelationships: [
        {
          identifier: "urn:li:userGeneratedContent",
          relationshipType: "OWNER",
        },
      ],
    },
  };

  const registerResult = await linkedInService.client.post(
    "/v2/assets?action=registerUpload",
    registerPayload,
    context
  ) as LinkedInRegisterUploadResponse;

  const uploadRequest =
    registerResult.value?.uploadMechanism?.["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"];
  const uploadUrl = uploadRequest?.uploadUrl;
  const assetUrn = registerResult.value?.asset;

  if (!uploadUrl || !assetUrn) {
    throw new Error("LinkedIn register upload failed: missing uploadUrl or asset URN");
  }

  // Step 2: Download file and PUT binary
  const { buffer, contentType } = await downloadFileToBuffer(
    input.mediaUrl,
    120_000,
    context
  );

  const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
  if (buffer.length > MAX_IMAGE_SIZE) {
    throw new Error(
      `Image file too large: ${(buffer.length / 1024 / 1024).toFixed(1)}MB exceeds LinkedIn's 5MB limit`
    );
  }

  await linkedInService.client.putBinary(uploadUrl, buffer, contentType, context);

  return {
    assetUrn,
    uploadedAt: new Date().toISOString(),
  };
}

export function uploadImageResponseFormatter(result: UploadImageOutput): McpTextContent[] {
  return [{
    type: "text" as const,
    text: `Image uploaded to LinkedIn!\n\nAsset URN: ${result.assetUrn}\n\nUse assetUrn in creative.content.media.reference for Sponsored Content.`,
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
    destructiveHint: true,
  },
  inputExamples: [
    {
      label: "Upload a banner image for LinkedIn ads",
      input: {
        adAccountUrn: "urn:li:sponsoredAccount:123456",
        mediaUrl: "https://example.com/banner-1200x627.jpg",
      },
    },
  ],
  logic: uploadImageLogic,
  responseFormatter: uploadImageResponseFormatter,
};
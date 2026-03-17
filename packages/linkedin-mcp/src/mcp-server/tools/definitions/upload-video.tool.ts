// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { downloadFileToBuffer } from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";
import type { LinkedInRegisterUploadResponse } from "../utils/media-types.js";

const TOOL_NAME = "linkedin_upload_video";
const TOOL_TITLE = "Upload Video to LinkedIn Ads";
const TOOL_DESCRIPTION = `Upload a video to LinkedIn Ads from a URL.

The server downloads the video and uploads it to LinkedIn's Digital Media Assets library.
Uses LinkedIn's 3-step upload flow: register → upload binary → confirm.

**Video requirements:**
- Formats: MP4 (H.264)
- Max file size: 200MB
- Duration: 3 seconds to 30 minutes
- Recommended: 1920x1080px (16:9), 1080x1080px (1:1)

**Usage:** The returned assetUrn is referenced in creative → content → media → reference`;

export const UploadVideoInputSchema = z.object({
  adAccountUrn: z.string().describe("LinkedIn Ad Account URN (e.g., urn:li:sponsoredAccount:123456)"),
  mediaUrl: z.string().url().describe("Publicly accessible URL of the video to upload"),
}).describe("Parameters for uploading a video to LinkedIn");

export const UploadVideoOutputSchema = z.object({
  assetUrn: z.string().describe("Asset URN (urn:li:digitalmediaAsset:...) for use in creative payloads"),
  uploadedAt: z.string().datetime(),
}).describe("Uploaded LinkedIn video asset");

type UploadVideoInput = z.infer<typeof UploadVideoInputSchema>;
type UploadVideoOutput = z.infer<typeof UploadVideoOutputSchema>;

export async function uploadVideoLogic(
  input: UploadVideoInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<UploadVideoOutput> {
  const { linkedInService } = resolveSessionServices(sdkContext);

  // Step 1: Register upload
  const registerPayload = {
    registerUploadRequest: {
      owner: input.adAccountUrn,
      recipes: ["urn:li:digitalmediaRecipe:ads-video"],
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

  // Step 2: Download file and PUT binary (5 min timeout for larger videos)
  const { buffer, contentType } = await downloadFileToBuffer(
    input.mediaUrl,
    300_000,
    context
  );

  const MAX_VIDEO_SIZE = 200 * 1024 * 1024; // 200MB
  if (buffer.length > MAX_VIDEO_SIZE) {
    throw new Error(
      `Video file too large: ${(buffer.length / 1024 / 1024).toFixed(1)}MB exceeds LinkedIn's 200MB limit`
    );
  }

  await linkedInService.client.putBinary(uploadUrl, buffer, contentType, context);

  return {
    assetUrn,
    uploadedAt: new Date().toISOString(),
  };
}

export function uploadVideoResponseFormatter(result: UploadVideoOutput): McpTextContent[] {
  return [{
    type: "text" as const,
    text: `Video uploaded to LinkedIn!\n\nAsset URN: ${result.assetUrn}\n\nUse assetUrn in creative.content.media.reference for Sponsored Content.`,
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
    destructiveHint: true,
  },
  inputExamples: [
    {
      label: "Upload a video ad for LinkedIn",
      input: {
        adAccountUrn: "urn:li:sponsoredAccount:123456",
        mediaUrl: "https://example.com/video-ad-1080p.mp4",
      },
    },
  ],
  logic: uploadVideoLogic,
  responseFormatter: uploadVideoResponseFormatter,
};
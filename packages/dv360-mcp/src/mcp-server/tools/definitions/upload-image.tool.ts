// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { downloadFileToBuffer } from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "dv360_upload_image";
const TOOL_TITLE = "Upload Image to DV360";
const TOOL_DESCRIPTION = `Upload an image asset to a DV360 advertiser from a URL.

The server downloads the image and uploads it via the DV360 asset upload API.
Returns the assetId which can be used when creating creatives.

**Image requirements:**
- Formats: JPEG, PNG, GIF, WEBP
- Check DV360 creative specs for size/dimension requirements per creative type

**Usage:** The returned assetId is used when creating or updating DV360 creatives.`;

export const UploadImageInputSchema = z
  .object({
    advertiserId: z.string().describe("DV360 Advertiser ID"),
    mediaUrl: z.string().url().describe("Publicly accessible URL of the image to upload"),
    name: z.string().optional().describe("Optional name for the uploaded asset"),
  })
  .describe("Parameters for uploading an image to DV360");

export const UploadImageOutputSchema = z
  .object({
    assetId: z.string().describe("DV360 asset media ID for use in creative payloads"),
    name: z.string().describe("Asset name"),
    uploadedAt: z.string().datetime(),
  })
  .describe("Uploaded image asset info");

type UploadImageInput = z.infer<typeof UploadImageInputSchema>;
type UploadImageOutput = z.infer<typeof UploadImageOutputSchema>;

export async function uploadImageLogic(
  input: UploadImageInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<UploadImageOutput> {
  const { dv360Service } = resolveSessionServices(sdkContext);

  const { buffer, contentType, filename } = await downloadFileToBuffer(
    input.mediaUrl,
    120_000,
    context
  );

  const effectiveName = input.name ?? filename;

  const result = await dv360Service.uploadAsset(
    input.advertiserId,
    buffer,
    effectiveName,
    contentType,
    context
  );

  return {
    assetId: result.asset.mediaId,
    name: effectiveName,
    uploadedAt: new Date().toISOString(),
  };
}

export function uploadImageResponseFormatter(result: UploadImageOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: [
        "Image uploaded to DV360!",
        "",
        `Asset ID: ${result.assetId}`,
        `Name: ${result.name}`,
        `Uploaded: ${result.uploadedAt}`,
        "",
        "Use assetId when creating or updating DV360 creatives.",
      ].join("\n"),
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
    destructiveHint: true,
  },
  inputExamples: [
    {
      label: "Upload a banner image",
      input: {
        advertiserId: "1234567890",
        mediaUrl: "https://example.com/banner-728x90.jpg",
        name: "Summer Campaign Banner",
      },
    },
  ],
  logic: uploadImageLogic,
  responseFormatter: uploadImageResponseFormatter,
};
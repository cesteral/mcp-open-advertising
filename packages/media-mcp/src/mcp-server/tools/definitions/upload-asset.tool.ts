import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "media_upload_asset";
const TOOL_TITLE = "Upload Media Asset";
const TOOL_DESCRIPTION = `Upload a media asset to the Cesteral media library from a URL.

The server downloads the file from the provided URL and uploads it to Supabase Storage.
Returns a permanent public URL and asset metadata.

**Supported formats:** JPEG, PNG, GIF, WebP (images), MP4, MOV, WebM (video)
**Use case:** Upload once, reference in multiple ad creatives across platforms.`;

export const UploadAssetInputSchema = z.object({
  mediaUrl: z.string().url().describe("Publicly accessible URL of the file to upload"),
  advertiserId: z.string().optional().describe("Advertiser ID to organize assets by account"),
  filename: z.string().optional().describe("Override filename (otherwise derived from URL)"),
  tags: z.record(z.string()).optional().describe("Key-value metadata tags"),
  platform: z.string().optional().describe("Target platform hint (e.g., meta, tiktok, linkedin, dv360)"),
}).describe("Parameters for uploading a media asset");

export const UploadAssetOutputSchema = z.object({
  assetId: z.string().describe("Unique asset identifier (UUID)"),
  storagePath: z.string().describe("Storage path used by media_get_asset, media_tag_asset, and media_delete_asset"),
  publicUrl: z.string().describe("Permanent public URL of the uploaded asset"),
  contentType: z.string().describe("MIME type of the uploaded file"),
  sizeBytes: z.number().describe("File size in bytes"),
  uploadedAt: z.string().datetime().describe("Upload timestamp (ISO 8601)"),
  advertiserId: z.string().optional(),
  platform: z.string().optional(),
  assetType: z.string().describe("Asset type: image, video, audio, or file"),
  filename: z.string().describe("Stored filename"),
}).describe("Uploaded asset metadata");

type UploadAssetInput = z.infer<typeof UploadAssetInputSchema>;
type UploadAssetOutput = z.infer<typeof UploadAssetOutputSchema>;

export async function uploadAssetLogic(
  input: UploadAssetInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<UploadAssetOutput> {
  const { mediaService } = resolveSessionServices(sdkContext);
  const result = await mediaService.uploadAsset(input, context);
  return {
    assetId: result.assetId,
    storagePath: result.storagePath,
    publicUrl: result.publicUrl,
    contentType: result.contentType,
    sizeBytes: result.sizeBytes,
    uploadedAt: result.uploadedAt,
    advertiserId: result.advertiserId,
    platform: result.platform,
    assetType: result.assetType ?? "file",
    filename: result.filename ?? "file",
  };
}

export function uploadAssetResponseFormatter(result: UploadAssetOutput): unknown[] {
  return [{
    type: "text" as const,
    text: `Asset uploaded successfully!\n\nAsset ID: ${result.assetId}\nPublic URL: ${result.publicUrl}\nType: ${result.assetType} (${result.contentType})\nSize: ${(result.sizeBytes / 1024).toFixed(1)} KB\nUploaded: ${result.uploadedAt}`,
  }];
}

export const uploadAssetTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: UploadAssetInputSchema,
  outputSchema: UploadAssetOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: true,
    idempotentHint: false,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Upload an image for Meta ads",
      input: {
        mediaUrl: "https://example.com/banner.jpg",
        advertiserId: "act_1234567890",
        platform: "meta",
        tags: { campaign: "summer-2025" },
      },
    },
  ],
  logic: uploadAssetLogic,
  responseFormatter: uploadAssetResponseFormatter,
};

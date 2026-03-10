import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "media_get_asset";

export const GetAssetInputSchema = z.object({
  storagePath: z.string().describe("Storage path returned from media_upload_asset (e.g., global/image/uuid.jpg)"),
}).describe("Parameters for getting a media asset");

export const GetAssetOutputSchema = z.object({
  assetId: z.string().describe("Unique asset identifier (UUID)"),
  storagePath: z.string().describe("Storage path for this asset"),
  publicUrl: z.string().describe("Permanent public URL of the asset"),
  contentType: z.string().describe("MIME type"),
  sizeBytes: z.number().describe("File size in bytes"),
  uploadedAt: z.string().describe("Upload timestamp (ISO 8601)"),
  advertiserId: z.string().optional(),
  platform: z.string().optional(),
  assetType: z.string().optional().describe("Asset type: image, video, audio, or file"),
  filename: z.string().optional().describe("Stored filename"),
  tags: z.record(z.string()).optional().describe("Current tags (includes post-upload updates from media_tag_asset)"),
}).describe("Asset metadata");

type GetAssetInput = z.infer<typeof GetAssetInputSchema>;
type GetAssetOutput = z.infer<typeof GetAssetOutputSchema>;

export async function getAssetLogic(
  input: GetAssetInput,
  _context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetAssetOutput> {
  const { mediaService } = resolveSessionServices(sdkContext);
  const result = await mediaService.getAsset(input.storagePath);
  return {
    assetId: result.assetId,
    storagePath: result.storagePath,
    publicUrl: result.publicUrl,
    contentType: result.contentType,
    sizeBytes: result.sizeBytes,
    uploadedAt: result.uploadedAt,
    advertiserId: result.advertiserId,
    platform: result.platform,
    assetType: result.assetType,
    filename: result.filename,
    tags: result.tags,
  };
}

export function getAssetResponseFormatter(result: GetAssetOutput): unknown[] {
  return [{
    type: "text" as const,
    text: `Asset: ${result.assetId}\nPath: ${result.storagePath}\nURL: ${result.publicUrl}\nType: ${result.assetType ?? "unknown"} (${result.contentType})\nSize: ${(result.sizeBytes / 1024).toFixed(1)} KB`,
  }];
}

export const getAssetTool = {
  name: TOOL_NAME,
  title: "Get Media Asset",
  description: "Get metadata and public URL for a media asset by its storage path. Use the storagePath returned from media_upload_asset.",
  inputSchema: GetAssetInputSchema,
  outputSchema: GetAssetOutputSchema,
  annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true, destructiveHint: false },
  inputExamples: [
    { label: "Get asset info", input: { storagePath: "act_123/image/550e8400-e29b-41d4-a716-446655440000.jpg" } },
  ],
  logic: getAssetLogic,
  responseFormatter: getAssetResponseFormatter,
};

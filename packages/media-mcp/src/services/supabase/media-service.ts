import { randomUUID } from "crypto";
import path from "path";
import type { Logger } from "pino";
import type { SupabaseStorageClient } from "./supabase-storage-client.js";
import type { AssetMetadata } from "./supabase-storage-client.js";
import { downloadFileToBuffer } from "@cesteral/shared";
import type { RequestContext } from "@cesteral/shared";

export interface UploadAssetParams {
  mediaUrl: string;
  advertiserId?: string;
  filename?: string;
  tags?: Record<string, string>;
  platform?: string;
}

export interface ListAssetsParams {
  advertiserId?: string;
  platform?: string;
  assetType?: string;
  limit?: number;
  cursor?: number;
}

export interface GetUploadUrlParams {
  filename: string;
  contentType: string;
  advertiserId?: string;
}

function getAssetType(contentType: string): string {
  if (contentType.startsWith("image/")) return "image";
  if (contentType.startsWith("video/")) return "video";
  if (contentType.startsWith("audio/")) return "audio";
  return "file";
}

function getExtension(filename: string, contentType: string): string {
  const ext = path.extname(filename);
  if (ext) return ext;
  const mimeToExt: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "video/webm": ".webm",
  };
  return mimeToExt[contentType] ?? "";
}

export class MediaService {
  constructor(
    private readonly storageClient: SupabaseStorageClient,
    private readonly logger: Logger
  ) {}

  async uploadAsset(
    params: UploadAssetParams,
    context?: RequestContext
  ): Promise<AssetMetadata> {
    const { buffer, contentType, filename: downloadedFilename } = await downloadFileToBuffer(
      params.mediaUrl,
      120_000,
      context
    );

    const assetType = getAssetType(contentType);
    const assetId = randomUUID();
    const effectiveFilename = params.filename ?? downloadedFilename;
    const ext = getExtension(effectiveFilename, contentType);
    const storagePath = `${params.advertiserId ?? "global"}/${assetType}/${assetId}${ext}`;

    const metadata: Record<string, string> = {
      assetId,
      contentType,
      filename: effectiveFilename,
      uploadedAt: new Date().toISOString(),
      sizeBytes: String(buffer.length),
      assetType,
      ...(params.advertiserId ? { advertiserId: params.advertiserId } : {}),
      ...(params.platform ? { platform: params.platform } : {}),
      ...(params.tags ? { tags: JSON.stringify(params.tags) } : {}),
    };

    const publicUrl = await this.storageClient.uploadFile(storagePath, buffer, contentType, metadata);

    this.logger.info({ assetId, storagePath, sizeBytes: buffer.length }, "Asset uploaded");

    return {
      assetId,
      publicUrl,
      contentType,
      sizeBytes: buffer.length,
      uploadedAt: metadata["uploadedAt"]!,
      advertiserId: params.advertiserId,
      platform: params.platform,
      assetType,
      filename: effectiveFilename,
      tags: params.tags,
    };
  }

  async listAssets(params: ListAssetsParams): Promise<AssetMetadata[]> {
    const prefix = params.advertiserId ?? "";
    const files = await this.storageClient.listFiles(
      prefix,
      params.limit ?? 50,
      params.cursor ?? 0
    );

    const assets: AssetMetadata[] = [];

    for (const file of files) {
      if (!file.metadata?.["assetId"]) continue;
      if (file.metadata["deleted"] === "true") continue;
      if (params.platform && file.metadata["platform"] !== params.platform) continue;
      if (params.assetType && file.metadata["assetType"] !== params.assetType) continue;

      const storagePath = prefix ? `${prefix}/${file.name}` : file.name;

      assets.push({
        assetId: file.metadata["assetId"],
        publicUrl: this.storageClient.getPublicUrl(storagePath),
        contentType: file.metadata["contentType"] ?? "application/octet-stream",
        sizeBytes: Number(file.metadata["sizeBytes"] ?? 0),
        uploadedAt: file.metadata["uploadedAt"] ?? "",
        advertiserId: file.metadata["advertiserId"],
        platform: file.metadata["platform"],
        assetType: file.metadata["assetType"],
        filename: file.metadata["filename"],
        tags: file.metadata["tags"] ? JSON.parse(file.metadata["tags"]) as Record<string, string> : undefined,
      });
    }

    return assets;
  }

  async deleteAsset(storagePath: string): Promise<void> {
    await this.storageClient.deleteFile(storagePath);
    this.logger.info({ storagePath }, "Asset deleted");
  }

  async getUploadUrl(
    params: GetUploadUrlParams
  ): Promise<{ signedUrl: string; assetId: string; expiresAt: string }> {
    const assetType = getAssetType(params.contentType);
    const assetId = randomUUID();
    const ext = getExtension(params.filename, params.contentType);
    const storagePath = `${params.advertiserId ?? "global"}/${assetType}/${assetId}${ext}`;

    const EXPIRES_IN_SECONDS = 3600;
    const { signedUrl } = await this.storageClient.createSignedUploadUrl(storagePath, EXPIRES_IN_SECONDS);

    return {
      signedUrl,
      assetId,
      expiresAt: new Date(Date.now() + EXPIRES_IN_SECONDS * 1000).toISOString(),
    };
  }
}

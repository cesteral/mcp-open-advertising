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

type SidecarData = { assetId: string; storagePath: string; tags: Record<string, string>; updatedAt: string };

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

    const uploadedAt = new Date().toISOString();
    const metadata: Record<string, string> = {
      assetId,
      contentType,
      filename: effectiveFilename,
      uploadedAt,
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
      storagePath,
      publicUrl,
      contentType,
      sizeBytes: buffer.length,
      uploadedAt,
      advertiserId: params.advertiserId,
      platform: params.platform,
      assetType,
      filename: effectiveFilename,
      tags: params.tags,
    };
  }

  /**
   * List assets by scanning the correct nested subfolders.
   *
   * Supabase `.list(prefix)` returns only immediate children at that prefix, not
   * recursively nested files. Assets are stored at:
   *   {advertiserId ?? "global"}/{assetType}/{uuid}.{ext}
   *
   * So to find actual files we must list at {advertiserId}/{assetType}/.
   * When no assetType filter is given we iterate all known type subfolders.
   *
   * Post-upload tags are stored in sidecar files at {advertiserPrefix}/.tags/{assetId}.json
   * because Supabase Storage metadata is immutable after upload. We batch-fetch the
   * .tags/ directory and merge any sidecar tags into the assembled asset list.
   */
  async listAssets(params: ListAssetsParams): Promise<AssetMetadata[]> {
    const advertiserPrefix = params.advertiserId ?? "global";
    const ASSET_TYPES = ["image", "video", "audio", "file"] as const;
    const typesToList = params.assetType
      ? [params.assetType]
      : (ASSET_TYPES as readonly string[]);

    // When listing all types, distribute the limit across subfolders
    const limit = params.limit ?? 50;
    const perTypeLimit = params.assetType ? limit : Math.ceil(limit / typesToList.length) + 1;
    const offset = params.cursor ?? 0;

    const assets: AssetMetadata[] = [];

    for (const type of typesToList) {
      const prefix = `${advertiserPrefix}/${type}`;
      const files = await this.storageClient.listFiles(prefix, perTypeLimit, offset);

      for (const file of files) {
        if (!file.metadata?.["assetId"]) continue;
        if (params.platform && file.metadata["platform"] !== params.platform) continue;

        const storagePath = `${prefix}/${file.name}`;

        assets.push({
          assetId: file.metadata["assetId"],
          storagePath,
          publicUrl: this.storageClient.getPublicUrl(storagePath),
          contentType: file.metadata["contentType"] ?? "application/octet-stream",
          sizeBytes: Number(file.metadata["sizeBytes"] ?? 0),
          uploadedAt: file.metadata["uploadedAt"] ?? "",
          advertiserId: file.metadata["advertiserId"],
          platform: file.metadata["platform"],
          assetType: file.metadata["assetType"],
          filename: file.metadata["filename"],
          tags: file.metadata["tags"]
            ? (JSON.parse(file.metadata["tags"]) as Record<string, string>)
            : undefined,
        });
      }
    }

    // Sort by uploadedAt descending and apply overall limit
    assets.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
    const page = assets.slice(0, limit);

    // Merge sidecar tags (post-upload tag updates) for all assets in the page
    if (page.length > 0) {
      const tagsMap = await this.fetchSidecarTagsMap(advertiserPrefix, page.map(a => a.assetId));
      for (const asset of page) {
        const sidecarTags = tagsMap.get(asset.assetId);
        if (sidecarTags) {
          asset.tags = sidecarTags;
        }
      }
    }

    return page;
  }

  /**
   * Get a single asset by its storage path.
   *
   * Lists the parent directory to read the actual Supabase object metadata
   * (contentType, sizeBytes, uploadedAt, etc.), then overlays any sidecar tags.
   */
  async getAsset(storagePath: string): Promise<AssetMetadata> {
    const directory = path.dirname(storagePath);
    const filename = path.basename(storagePath);
    const parts = storagePath.split("/");
    const advertiserPrefix = parts[0];
    const advertiserId = parts[0] !== "global" ? parts[0] : undefined;
    const assetType = parts[1];
    const assetId = path.basename(storagePath, path.extname(storagePath));

    // Fetch real object metadata via a targeted search (search filters by exact name prefix,
    // so limit:1 reliably returns just this file regardless of directory size)
    const files = await this.storageClient.listFiles(directory, 1, 0, filename);
    const file = files.find(f => f.name === filename);

    const contentType = file?.metadata?.["contentType"] ?? "application/octet-stream";
    const sizeBytes = Number(file?.metadata?.["sizeBytes"] ?? 0);
    const uploadedAt = file?.metadata?.["uploadedAt"] ?? "";
    const platform = file?.metadata?.["platform"];
    const filenameStored = file?.metadata?.["filename"];

    // Start with upload-time tags from object metadata
    let tags: Record<string, string> | undefined = file?.metadata?.["tags"]
      ? (JSON.parse(file.metadata["tags"]) as Record<string, string>)
      : undefined;

    // Override with sidecar tags when present (post-upload tag updates take precedence)
    const sidecarPath = `${advertiserPrefix}/.tags/${assetId}.json`;
    const sidecar = (await this.storageClient.downloadJson(sidecarPath)) as SidecarData | null;
    if (sidecar?.tags) {
      tags = sidecar.tags;
    }

    const publicUrl = this.storageClient.getPublicUrl(storagePath);

    return {
      assetId,
      storagePath,
      publicUrl,
      contentType,
      sizeBytes,
      uploadedAt,
      advertiserId,
      platform,
      assetType,
      filename: filenameStored,
      tags,
    };
  }

  /**
   * Persist tags for an asset using a sidecar JSON file.
   *
   * Supabase Storage does not support updating object metadata after upload.
   * Tags are stored in a small sidecar at:
   *   {advertiserPrefix}/.tags/{assetId}.json
   *
   * Tags are merged with any existing sidecar tags.
   */
  async tagAsset(
    assetId: string,
    storagePath: string,
    tags: Record<string, string>
  ): Promise<Record<string, string>> {
    const advertiserPrefix = storagePath.split("/")[0] ?? "global";
    const sidecarPath = `${advertiserPrefix}/.tags/${assetId}.json`;

    const existing = (await this.storageClient.downloadJson(sidecarPath)) as SidecarData | null;
    const mergedTags: Record<string, string> = { ...(existing?.tags ?? {}), ...tags };

    await this.storageClient.uploadJson(sidecarPath, {
      assetId,
      storagePath,
      tags: mergedTags,
      updatedAt: new Date().toISOString(),
    });

    this.logger.info({ assetId, tagCount: Object.keys(mergedTags).length }, "Asset tags updated");
    return mergedTags;
  }

  /**
   * Permanently delete an asset and its tags sidecar (if present).
   *
   * Hard delete: the file is removed from Supabase Storage immediately.
   * Deleted files naturally stop appearing in listAssets results.
   */
  async deleteAsset(storagePath: string): Promise<void> {
    await this.storageClient.deleteFile(storagePath);

    // Best-effort: also remove the tags sidecar
    const assetId = path.basename(storagePath, path.extname(storagePath));
    const advertiserPrefix = storagePath.split("/")[0] ?? "global";
    const sidecarPath = `${advertiserPrefix}/.tags/${assetId}.json`;
    try {
      await this.storageClient.deleteFile(sidecarPath);
    } catch {
      // Sidecar may not exist; ignore the error
    }

    this.logger.info({ storagePath }, "Asset deleted");
  }

  /**
   * Generate a signed upload URL for direct client upload.
   *
   * NOTE: This creates a storage slot and returns the storagePath where the
   * file will land after a successful PUT. The file will NOT automatically
   * appear in media_list_assets — Supabase Storage metadata is written at
   * upload time by the client, which cannot supply the library metadata fields.
   * Use media_upload_asset (server-side URL-proxy) to get full library
   * integration with listing, tagging, and deletion by asset ID.
   */
  async getUploadUrl(
    params: GetUploadUrlParams
  ): Promise<{ signedUrl: string; storagePath: string; expiresAt: string }> {
    const assetType = getAssetType(params.contentType);
    const assetId = randomUUID();
    const ext = getExtension(params.filename, params.contentType);
    const storagePath = `${params.advertiserId ?? "global"}/${assetType}/${assetId}${ext}`;

    const EXPIRES_IN_SECONDS = 3600;
    const { signedUrl } = await this.storageClient.createSignedUploadUrl(storagePath, EXPIRES_IN_SECONDS);

    return {
      signedUrl,
      storagePath,
      expiresAt: new Date(Date.now() + EXPIRES_IN_SECONDS * 1000).toISOString(),
    };
  }

  /**
   * Batch-fetch sidecar tags for a set of asset IDs under a given advertiser prefix.
   *
   * Downloads each sidecar directly in parallel. downloadJson returns null for
   * missing files, so no directory listing is needed — this approach is always
   * correct regardless of total sidecar count or sort order.
   * Cost: N parallel downloads, one per asset in the result page.
   */
  private async fetchSidecarTagsMap(
    advertiserPrefix: string,
    assetIds: string[]
  ): Promise<Map<string, Record<string, string>>> {
    const tagsMap = new Map<string, Record<string, string>>();
    if (assetIds.length === 0) return tagsMap;

    await Promise.all(assetIds.map(async (assetId) => {
      const sidecarPath = `${advertiserPrefix}/.tags/${assetId}.json`;
      const data = (await this.storageClient.downloadJson(sidecarPath)) as SidecarData | null;
      if (data?.tags) {
        tagsMap.set(assetId, data.tags);
      }
    }));

    return tagsMap;
  }
}

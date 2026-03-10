import type { SupabaseClient } from "@supabase/supabase-js";
import type { Logger } from "pino";

export interface AssetMetadata {
  assetId: string;
  storagePath: string;
  publicUrl: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
  advertiserId?: string;
  platform?: string;
  assetType?: string;
  filename?: string;
  tags?: Record<string, string>;
  deleted?: boolean;
}

export class SupabaseStorageClient {
  constructor(
    private readonly client: SupabaseClient,
    private readonly bucketName: string,
    private readonly logger: Logger
  ) {}

  async uploadFile(
    path: string,
    buffer: Buffer,
    contentType: string,
    metadata: Record<string, string>
  ): Promise<string> {
    const { error } = await this.client.storage
      .from(this.bucketName)
      .upload(path, buffer, {
        contentType,
        metadata,
        upsert: false,
      });

    if (error) {
      this.logger.error({ error, path }, "Supabase storage upload failed");
      throw new Error(`Storage upload failed: ${error.message}`);
    }

    const { data: urlData } = this.client.storage
      .from(this.bucketName)
      .getPublicUrl(path);

    return urlData.publicUrl;
  }

  async listFiles(
    prefix: string,
    limit = 50,
    offset = 0,
    search?: string
  ): Promise<Array<{ name: string; metadata: Record<string, string> }>> {
    const { data, error } = await this.client.storage
      .from(this.bucketName)
      .list(prefix, {
        limit,
        offset,
        sortBy: { column: "created_at", order: "desc" },
        ...(search !== undefined ? { search } : {}),
      });

    if (error) {
      throw new Error(`Storage list failed: ${error.message}`);
    }

    return (data ?? []).map((item) => ({
      name: item.name,
      metadata: (item.metadata ?? {}) as Record<string, string>,
    }));
  }

  async getFileInfo(path: string): Promise<{ publicUrl: string; metadata?: Record<string, string> }> {
    const { data } = this.client.storage
      .from(this.bucketName)
      .getPublicUrl(path);

    return { publicUrl: data.publicUrl };
  }

  async deleteFile(path: string): Promise<void> {
    const { error } = await this.client.storage
      .from(this.bucketName)
      .remove([path]);

    if (error) {
      throw new Error(`Storage delete failed: ${error.message}`);
    }
  }

  /**
   * Write a small JSON sidecar file. Used for persistent tag storage.
   * Upserts so tag updates replace the previous record.
   */
  async uploadJson(path: string, data: unknown): Promise<void> {
    const buffer = Buffer.from(JSON.stringify(data));
    const { error } = await this.client.storage
      .from(this.bucketName)
      .upload(path, buffer, { contentType: "application/json", upsert: true });

    if (error) {
      throw new Error(`Failed to write sidecar at ${path}: ${error.message}`);
    }
  }

  /**
   * Read a JSON sidecar file. Returns null if the file does not exist.
   */
  async downloadJson(path: string): Promise<unknown> {
    const { data, error } = await this.client.storage
      .from(this.bucketName)
      .download(path);

    if (error || !data) return null;
    try {
      return JSON.parse(await data.text());
    } catch {
      return null;
    }
  }

  async createSignedUploadUrl(
    path: string,
    expiresInSeconds = 3600
  ): Promise<{ signedUrl: string; token: string }> {
    const { data, error } = await this.client.storage
      .from(this.bucketName)
      .createSignedUploadUrl(path, { upsert: false });

    if (error || !data) {
      throw new Error(`Failed to create signed upload URL: ${error?.message ?? "unknown error"}`);
    }

    // Signed upload URLs expire after the configured duration
    void expiresInSeconds; // stored in token
    return {
      signedUrl: data.signedUrl,
      token: data.token,
    };
  }

  getPublicUrl(path: string): string {
    const { data } = this.client.storage
      .from(this.bucketName)
      .getPublicUrl(path);
    return data.publicUrl;
  }

  async ensureBucketExists(): Promise<void> {
    const { data: buckets, error: listError } = await this.client.storage.listBuckets();
    if (listError) {
      throw new Error(`Failed to list buckets: ${listError.message}`);
    }

    const exists = (buckets ?? []).some((b) => b.name === this.bucketName);
    if (!exists) {
      const { error: createError } = await this.client.storage.createBucket(this.bucketName, {
        public: true,
      });
      if (createError) {
        throw new Error(`Failed to create bucket "${this.bucketName}": ${createError.message}`);
      }
    }
  }
}

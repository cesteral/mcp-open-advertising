// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Response from POST /v5/media — step 1 of Pinterest's two-step media upload.
 * Contains a pre-signed S3 URL and form parameters for the actual file upload.
 */
export interface PinterestMediaRegisterResponse {
  media_id: string;
  media_type?: string;
  upload_url: string;
  upload_parameters: Record<string, string>;
}

/** v5 `MediaUploadStatus`. */
export type PinterestMediaUploadStatus = "registered" | "processing" | "succeeded" | "failed";

/**
 * Response from GET /v5/media/{media_id} — status polling after upload
 * (v5 `Media`: `{ media_id, media_type, status }`, status at the top level).
 */
export interface PinterestMediaStatusResponse {
  media_id?: string;
  media_type?: string;
  status?: PinterestMediaUploadStatus;
}

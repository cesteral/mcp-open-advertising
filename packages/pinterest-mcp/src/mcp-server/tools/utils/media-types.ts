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

/**
 * Response from GET /v5/media/{media_id} — status polling after upload.
 */
export interface PinterestMediaStatusResponse {
  media_id?: string;
  media_processing_record?: {
    status?: string;
  };
  media_type?: string;
}

/** @deprecated Use PinterestMediaRegisterResponse */
export type PinterestMediaUploadResponse = PinterestMediaRegisterResponse;

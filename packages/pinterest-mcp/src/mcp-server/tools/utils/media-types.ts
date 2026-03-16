// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

export interface PinterestMediaUploadResponse {
  media_id?: string;
  media_type?: string;
}

export interface PinterestMediaStatusResponse {
  media_id?: string;
  media_processing_record?: {
    status?: string;
  };
  media_type?: string;
}

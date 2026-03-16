// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

export interface SnapchatMediaItem {
  id?: string;
  media_status?: string;
}

export interface SnapchatMediaUploadResponse {
  request_status?: string;
  media?: Array<{
    sub_request_status?: string;
    media?: SnapchatMediaItem;
  }>;
}

export interface SnapchatMediaGetResponse {
  request_status?: string;
  media?: Array<{
    sub_request_status?: string;
    media?: SnapchatMediaItem;
  }>;
}

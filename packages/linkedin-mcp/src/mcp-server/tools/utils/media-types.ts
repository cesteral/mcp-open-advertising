// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

export interface LinkedInRegisterUploadResponse {
  value?: {
    uploadMechanism?: {
      "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"?: {
        uploadUrl?: string;
        headers?: Record<string, string>;
      };
    };
    asset?: string;
  };
}

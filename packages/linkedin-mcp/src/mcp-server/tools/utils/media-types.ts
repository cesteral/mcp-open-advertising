// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";

/**
 * `initializeUploadRequest.owner` on the Images and Videos APIs: "Can be a
 * person(urn:li:person:123), or organization(urn:li:organization:123) URN"
 * (LinkedIn Images API and Videos API pages, li-lms-2026-10, read 2026-11-16).
 * An ad account (`urn:li:sponsoredAccount:…`) is not an upload owner. Person
 * ids are LinkedIn's opaque member ids, so they are not restricted to digits.
 */
export const UploadOwnerUrnSchema = z
  .string()
  .regex(
    /^urn:li:(person:[A-Za-z0-9_-]+|organization:\d+)$/,
    "ownerUrn must be a person (urn:li:person:…) or organization (urn:li:organization:…) URN, not an ad account"
  )
  .describe(
    "Owner of the uploaded media: the organization (urn:li:organization:123) whose page will author the post, or a person (urn:li:person:abc). Not the ad account."
  );

/** `POST /rest/images?action=initializeUpload` response. */
export interface LinkedInInitializeImageUploadResponse {
  value?: {
    uploadUrlExpiresAt?: number;
    uploadUrl?: string;
    /** `urn:li:image:…` */
    image?: string;
  };
}

/** One part of a multipart video upload: an inclusive byte range and its URL. */
export interface LinkedInVideoUploadInstruction {
  uploadUrl?: string;
  firstByte?: number;
  lastByte?: number;
}

/** `POST /rest/videos?action=initializeUpload` response. */
export interface LinkedInInitializeVideoUploadResponse {
  value?: {
    uploadUrlsExpireAt?: number;
    /** `urn:li:video:…` */
    video?: string;
    uploadInstructions?: LinkedInVideoUploadInstruction[];
    uploadToken?: string;
  };
}

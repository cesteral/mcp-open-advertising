// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { UploadOwnerUrnSchema } from "../utils/media-types.js";
import {
  downloadFileToBuffer,
  NO_UNTRUSTED_CONTENT,
  McpError,
  JsonRpcErrorCode,
  assertGovernedEffectDryRun,
  EffectResultSchema,
  EffectDryRunResultSchema,
  DispatchedCapabilitySchema,
} from "@cesteral/shared";
import type {
  RequestContext,
  McpTextContent,
  SdkContext,
  EffectResult,
  EffectDryRunResult,
  DispatchedCapability,
  DryRunValidationError,
  CesteralWriteToolAnnotations,
} from "@cesteral/shared";

const TOOL_NAME = "linkedin_upload_video";
const TOOL_TITLE = "Upload Video to LinkedIn Ads";
const TOOL_DESCRIPTION = `Upload a video to LinkedIn from a URL, on LinkedIn's Videos API.

The server downloads the video, then: \`POST /rest/videos?action=initializeUpload\` with the owner and
the file size; a PUT of each part to the upload URLs LinkedIn returns (parts of about 4MB, each answered
with an ETag); and \`POST /rest/videos?action=finalizeUpload\` with those ETags in order. The result is a
video URN (\`urn:li:video:…\`), PROCESSING until LinkedIn marks it AVAILABLE. If a part fails, the video
stays WAITING_UPLOAD upstream; upload it again.

**Owner:** \`ownerUrn\` is the organization (or person) that owns the video, normally the organization
whose page authors the post the ad sponsors. It is not the ad account.

**Video requirements:**
- Format: MP4
- Duration: 3 seconds to 30 minutes
- File size: 75KB to 500MB for ads on LinkedIn; this server refuses files over 200MB, because it holds the
  whole file in memory (checked before anything is sent)

**Usage:** put the videoUrn in a post's content.media.id (Posts API, not wrapped by this server), then
create the creative with content.reference set to that post's URN.`;

const ASSET_TYPE = "video";

export const UploadVideoInputSchema = z
  .object({
    ownerUrn: UploadOwnerUrnSchema,
    mediaUrl: z.string().url().describe("Publicly accessible URL of the video to upload"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the upload request and returns an EffectDryRunResult under `dryRun` (expected effect = the would-be video upload) without downloading or uploading anything. No asset is created."
      ),
  })
  .describe("Parameters for uploading a video to LinkedIn");

export const UploadVideoOutputSchema = z
  .object({
    videoUrn: z
      .string()
      .optional()
      .describe(
        "Video URN (urn:li:video:...) for a post's content.media.id. Absent on a dry_run (nothing was uploaded)."
      ),
    uploadedAt: z.string().datetime(),
    dryRun: EffectDryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. No asset was uploaded."
    ),
    effect: EffectResultSchema.optional().describe(
      "Effect-class result identity (effectKind `asset_uploaded` + scalar audit summary). Present on a confirmed execute. Effect writes carry no canonical entity snapshot."
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "The concrete (operation, entityKind) this call resolved to — `upload` with `canonicalEntityKind: null` (effect class). Present on every response."
    ),
  })
  .describe("Uploaded LinkedIn video");

type UploadVideoInput = z.infer<typeof UploadVideoInputSchema>;
type UploadVideoOutput = z.infer<typeof UploadVideoOutputSchema>;

export async function uploadVideoLogic(
  input: UploadVideoInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<UploadVideoOutput> {
  // Effect-class write: no canonical entity snapshot. The capability is
  // `upload` with a null entity kind on every response.
  const dispatchedCapability: DispatchedCapability = {
    operation: "upload",
    canonicalEntityKind: null,
  };

  // Symbolic dry-run: validate the request and project the would-be effect
  // (a video asset upload). No download, no API call.
  if (input.dry_run === true) {
    const dryRun = buildUploadEffectDryRun(input.mediaUrl);
    return {
      uploadedAt: new Date().toISOString(),
      dryRun,
      dispatchedCapability,
    };
  }

  const { linkedInService } = resolveSessionServices(sdkContext);

  // Download and size-check the file BEFORE initializing the upload, so a bad
  // mediaUrl or an oversized file fails without leaving an initialized
  // video upstream. The size limit is the caller's input, so InvalidParams.
  const { buffer } = await downloadFileToBuffer(input.mediaUrl, 300_000, context);

  // LinkedIn takes up to 500MB for ads (Videos API); this server holds the
  // whole file in memory, so it stops at 200MB.
  const MAX_VIDEO_SIZE = 200 * 1024 * 1024; // 200MB
  if (buffer.length > MAX_VIDEO_SIZE) {
    throw new McpError(
      JsonRpcErrorCode.InvalidParams,
      `Video file too large: ${(buffer.length / 1024 / 1024).toFixed(1)}MB exceeds this server's 200MB upload limit`
    );
  }

  const videoUrn = await linkedInService.uploadVideo(input.ownerUrn, buffer, context);

  const effect: EffectResult = {
    effectKind: "asset_uploaded",
    summary: { asset_type: ASSET_TYPE, asset_handle: videoUrn },
  };

  return {
    videoUrn,
    uploadedAt: new Date().toISOString(),
    effect,
    dispatchedCapability,
  };
}

/**
 * Symbolic effect dry-run for `upload_video`. Validates the request (mediaUrl
 * must be an http(s) URL — Zod's `.url()` admits other schemes like ftp://) and
 * projects the would-be effect (a video asset upload). The upload fetches the
 * URL and streams it upstream — there is no native validate/preview — so both
 * axes are symbolic. Pure (no I/O: no download, no upload). */
function buildUploadEffectDryRun(mediaUrl: string): EffectDryRunResult {
  const validationErrors: DryRunValidationError[] = [];
  let protocolOk: boolean;
  try {
    const parsed = new URL(mediaUrl);
    protocolOk = parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    protocolOk = false;
  }
  if (!protocolOk) {
    validationErrors.push({
      code: "INVALID_MEDIA_URL",
      message: `mediaUrl must be an http(s) URL — got "${mediaUrl}"`,
      field: "mediaUrl",
    });
  }

  const expectedEffect: EffectResult = {
    effectKind: "asset_uploaded",
    summary: { asset_type: ASSET_TYPE },
  };

  return assertGovernedEffectDryRun(
    {
      wouldSucceed: validationErrors.length === 0,
      validationErrors,
      validationSource: "symbolic",
      expectedEffectSource: "symbolic",
      expectedEffect,
    },
    TOOL_NAME,
    { requiresValidation: true, requiresSimulation: true }
  );
}

export function uploadVideoResponseFormatter(result: UploadVideoOutput): McpTextContent[] {
  if (result.dryRun) {
    const { wouldSucceed, validationErrors, validationSource, expectedEffectSource } =
      result.dryRun;
    const verdict = wouldSucceed ? "would succeed" : "would FAIL";
    const errs = validationErrors.map((e) => `  - [${e.code}] ${e.message}`).join("\n");
    return [
      {
        type: "text" as const,
        text:
          `Dry run: uploading a ${ASSET_TYPE} ${verdict} (validation: ${validationSource}, expected-effect: ${expectedEffectSource}). No asset was uploaded.` +
          (errs ? `\n${errs}` : "") +
          `\n\nTimestamp: ${result.uploadedAt}`,
      },
    ];
  }
  return [
    {
      type: "text" as const,
      text: `Video uploaded to LinkedIn.

Video URN: ${result.videoUrn}

LinkedIn processes it before it can be served. Put the videoUrn in a post's content.media.id, then create the creative with content.reference set to the post URN.`,
    },
  ];
}

export const uploadVideoTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: UploadVideoInputSchema,
  outputSchema: UploadVideoOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: true,
    idempotentHint: false,
    destructiveHint: false,
    cesteral: {
      kind: "write",
      writeClass: "effect",
      executableArgsExclude: ["dry_run"],
      platform: "linkedin_ads",
      contractPlatformSlug: "linkedin_ads",
      contractToolSlug: "upload_video",
      operation: ["upload"],
      // Effect-class: a media upload that creates an asset with no canonical entity snapshot.
      entityKinds: [],
      entityIdArgs: [],
      schemaVersion: 1,
      contractId: "linkedin_ads.upload_video.v1",
      // `dry_run` = symbolic validate + symbolic effect projection. LinkedIn has no
      // native upload validate/preview, so both axes are symbolic (honest true).
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Upload a video ad for LinkedIn",
      input: {
        ownerUrn: "urn:li:organization:2414183",
        mediaUrl: "https://example.com/video-ad-1080p.mp4",
      },
    },
  ],
  logic: uploadVideoLogic,
  responseFormatter: uploadVideoResponseFormatter,
  untrustedContent: NO_UNTRUSTED_CONTENT,
};

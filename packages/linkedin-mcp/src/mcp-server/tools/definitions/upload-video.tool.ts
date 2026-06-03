// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
  downloadFileToBuffer,
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
import type { LinkedInRegisterUploadResponse } from "../utils/media-types.js";

const TOOL_NAME = "linkedin_upload_video";
const TOOL_TITLE = "Upload Video to LinkedIn Ads";
const TOOL_DESCRIPTION = `Upload a video to LinkedIn Ads from a URL.

The server downloads the video and uploads it to LinkedIn's Digital Media Assets library.
Uses LinkedIn's 3-step upload flow: register → upload binary → confirm.

**Video requirements:**
- Formats: MP4 (H.264)
- Max file size: 200MB
- Duration: 3 seconds to 30 minutes
- Recommended: 1920x1080px (16:9), 1080x1080px (1:1)

**Usage:** The returned assetUrn is referenced in creative → content → media → reference`;

const ASSET_TYPE = "video";

export const UploadVideoInputSchema = z
  .object({
    adAccountUrn: z
      .string()
      .describe("LinkedIn Ad Account URN (e.g., urn:li:sponsoredAccount:123456)"),
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
    assetUrn: z
      .string()
      .optional()
      .describe(
        "Asset URN (urn:li:digitalmediaAsset:...) for use in creative payloads. Absent on a dry_run (nothing was uploaded)."
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
  .describe("Uploaded LinkedIn video asset");

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

  // Step 1: Register upload
  const registerPayload = {
    registerUploadRequest: {
      owner: input.adAccountUrn,
      recipes: ["urn:li:digitalmediaRecipe:ads-video"],
      serviceRelationships: [
        {
          identifier: "urn:li:userGeneratedContent",
          relationshipType: "OWNER",
        },
      ],
    },
  };

  const registerResult = (await linkedInService.client.post(
    "/v2/assets?action=registerUpload",
    registerPayload,
    context
  )) as LinkedInRegisterUploadResponse;

  const uploadRequest =
    registerResult.value?.uploadMechanism?.[
      "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"
    ];
  const uploadUrl = uploadRequest?.uploadUrl;
  const assetUrn = registerResult.value?.asset;

  if (!uploadUrl || !assetUrn) {
    throw new McpError(
      JsonRpcErrorCode.InternalError,
      "LinkedIn register upload failed: missing uploadUrl or asset URN"
    );
  }

  // Step 2: Download file and PUT binary (5 min timeout for larger videos)
  const { buffer, contentType } = await downloadFileToBuffer(input.mediaUrl, 300_000, context);

  const MAX_VIDEO_SIZE = 200 * 1024 * 1024; // 200MB
  if (buffer.length > MAX_VIDEO_SIZE) {
    throw new McpError(
      JsonRpcErrorCode.InternalError,
      `Video file too large: ${(buffer.length / 1024 / 1024).toFixed(1)}MB exceeds LinkedIn's 200MB limit`
    );
  }

  await linkedInService.client.putBinary(uploadUrl, buffer, contentType, context);

  const effect: EffectResult = {
    effectKind: "asset_uploaded",
    summary: { asset_type: ASSET_TYPE, asset_handle: assetUrn },
  };

  return {
    assetUrn,
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
  let protocolOk = false;
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
      text: `Video uploaded to LinkedIn!\n\nAsset URN: ${result.assetUrn}\n\nUse assetUrn in creative.content.media.reference for Sponsored Content.`,
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
    destructiveHint: true,
    cesteral: {
      kind: "write",
      writeClass: "effect",
      executableArgsExclude: ["dry_run"],
      platform: "linkedin_ads",
      contractPlatformSlug: "linkedin",
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
        adAccountUrn: "urn:li:sponsoredAccount:123456",
        mediaUrl: "https://example.com/video-ad-1080p.mp4",
      },
    },
  ],
  logic: uploadVideoLogic,
  responseFormatter: uploadVideoResponseFormatter,
};

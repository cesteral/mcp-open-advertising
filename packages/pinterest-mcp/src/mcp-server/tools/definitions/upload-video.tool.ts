// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { assertAccountScope } from "@cesteral/shared";
import {
  downloadFileToBuffer,
  McpError,
  JsonRpcErrorCode,
  pollUntilComplete,
  ReportTimeoutError,
  ReportFailedError,
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
import { mcpConfig } from "../../../config/index.js";
import type {
  PinterestMediaRegisterResponse,
  PinterestMediaStatusResponse,
} from "../utils/media-types.js";

const TOOL_NAME = "pinterest_upload_video";
const TOOL_TITLE = "Upload Video to Pinterest Ads";
const TOOL_DESCRIPTION = `Upload a video to Pinterest Ads Library from a URL.

The server downloads the video and uploads it to Pinterest's ad media library.
Polls until processing is complete (up to 10 minutes).

**Video requirements:**
- Formats: MP4, MOV (H.264 codec recommended)
- Max file size: 500MB
- Min resolution: 240px on shortest side
- Duration: 2 to 60 seconds for standard ads

**Usage:** The returned mediaId is used in ad creative payloads.`;

const ASSET_TYPE = "video";

export const UploadVideoInputSchema = z
  .object({
    adAccountId: z.string().describe("Pinterest Ad Account ID"),
    mediaUrl: z.string().url().describe("Publicly accessible URL of the video to upload"),
    videoName: z.string().optional().describe("Optional name for the video in the library"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the upload request and returns an EffectDryRunResult under `dryRun` (expected effect = the would-be video upload) without downloading or uploading anything. No asset is created."
      ),
  })
  .describe("Parameters for uploading a video to Pinterest");

export const UploadVideoOutputSchema = z
  .object({
    mediaId: z
      .string()
      .optional()
      .describe(
        "Media ID for use in ad creative payloads. Absent on a dry_run (nothing was uploaded)."
      ),
    mediaStatus: z.string().optional().describe("Final media processing status"),
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
  .describe("Uploaded Pinterest video info");

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

  const { pinterestService, boundAdAccountId } = resolveSessionServices(sdkContext);
  assertAccountScope(input.adAccountId, boundAdAccountId, "adAccountId");

  const { buffer, contentType, filename } = await downloadFileToBuffer(
    input.mediaUrl,
    600_000, // 10 min for large videos
    context
  );

  // Step 1: Register the upload with Pinterest to get a pre-signed S3 URL
  const registration = (await pinterestService.client.post(
    "/v5/media",
    { media_type: "video" },
    context
  )) as PinterestMediaRegisterResponse;

  const mediaId = registration.media_id;
  if (!mediaId || !registration.upload_url) {
    throw new McpError(
      JsonRpcErrorCode.InternalError,
      "Pinterest video upload registration failed: missing media_id or upload_url"
    );
  }

  // Step 2: Upload the file to S3 using the pre-signed URL and parameters
  await pinterestService.client.uploadToS3(
    registration.upload_url,
    registration.upload_parameters ?? {},
    buffer,
    input.videoName ?? filename,
    contentType,
    context
  );

  // Poll for processing status
  try {
    const finalStatus = await pollUntilComplete<string>({
      fetchStatus: async () => {
        const statusResult = (await pinterestService.client.get(
          `/v5/media/${mediaId}`,
          undefined,
          context
        )) as PinterestMediaStatusResponse;
        return statusResult.media_processing_record?.status ?? "processing";
      },
      isComplete: (s) => s === "succeeded" || s === "SUCCEEDED",
      isFailed: (s) => s === "failed" || s === "FAILED",
      initialDelayMs: mcpConfig.pinterestVideoUploadPollIntervalMs,
      maxDelayMs: mcpConfig.pinterestVideoUploadPollIntervalMs,
      maxAttempts: mcpConfig.pinterestVideoUploadMaxPollAttempts,
      backoffFactor: 1,
    });
    return {
      mediaId,
      mediaStatus: finalStatus,
      uploadedAt: new Date().toISOString(),
      effect: buildUploadedEffect(mediaId),
      dispatchedCapability,
    };
  } catch (error) {
    if (error instanceof ReportFailedError) {
      throw new McpError(
        JsonRpcErrorCode.InternalError,
        `Pinterest video processing failed: status=${String(error.status)}`
      );
    }
    if (error instanceof ReportTimeoutError) {
      // Polling timed out — video may still be processing
      return {
        mediaId,
        uploadedAt: new Date().toISOString(),
        effect: buildUploadedEffect(mediaId),
        dispatchedCapability,
      };
    }
    throw error;
  }
}

function buildUploadedEffect(mediaId: string): EffectResult {
  return {
    effectKind: "asset_uploaded",
    summary: { asset_type: ASSET_TYPE, asset_handle: mediaId },
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
      text: `Video uploaded to Pinterest!\n\nMedia ID: ${result.mediaId}${result.mediaStatus ? `\nStatus: ${result.mediaStatus}` : ""}\n\nUse mediaId in your ad creative payload`,
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
      platform: "pinterest",
      contractPlatformSlug: "pinterest",
      contractToolSlug: "upload_video",
      operation: ["upload"],
      // Effect-class: a media upload that creates an asset with no canonical entity snapshot.
      entityKinds: [],
      entityIdArgs: [],
      schemaVersion: 1,
      contractId: "pinterest.upload_video.v1",
      // `dry_run` = symbolic validate + symbolic effect projection. Pinterest has no
      // native upload validate/preview, so both axes are symbolic (honest true).
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Upload a Pinterest campaign video",
      input: {
        adAccountId: "1234567890",
        mediaUrl: "https://example.com/video.mp4",
        videoName: "Summer Campaign 2025",
      },
    },
  ],
  logic: uploadVideoLogic,
  responseFormatter: uploadVideoResponseFormatter,
};

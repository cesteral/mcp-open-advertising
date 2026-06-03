// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
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
import { mcpConfig } from "../../../config/index.js"; // poll config only

const TOOL_NAME = "tiktok_upload_video";
const TOOL_TITLE = "Upload Video to TikTok Ads";
const TOOL_DESCRIPTION = `Upload a video to TikTok Ads Library from a URL.

The server downloads the video and uploads it to TikTok's ad video library.
Polls until binding is complete (up to 10 minutes).

**Video requirements:**
- Formats: MP4, MOV, AVI (H.264/H.265 codec recommended)
- Max file size: 500MB
- Min resolution: 540x960px (9:16), 960x540px (16:9), or 640x640px (1:1)
- Duration: 5 to 60 seconds for In-Feed ads

**Usage:** The returned videoId is used in ad creative payloads.`;

const ASSET_TYPE = "video";

export const UploadVideoInputSchema = z
  .object({
    advertiserId: z
      .string()
      .describe(
        "TikTok Advertiser ID (informational — the session-bound advertiser from authentication is used for API calls)"
      ),
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
  .describe("Parameters for uploading a video to TikTok");

export const UploadVideoOutputSchema = z
  .object({
    videoId: z
      .string()
      .optional()
      .describe(
        "Video ID for use in ad creative payloads. Absent on a dry_run (nothing was uploaded)."
      ),
    videoName: z.string().optional(),
    duration: z.number().optional().describe("Video duration in seconds"),
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
  .describe("Uploaded TikTok video info");

type UploadVideoInput = z.infer<typeof UploadVideoInputSchema>;
type UploadVideoOutput = z.infer<typeof UploadVideoOutputSchema>;

interface TikTokVideoUploadResponse {
  video_id?: string;
  video_name?: string;
}

interface TikTokVideoInfoItem {
  video_id: string;
  video_name?: string;
  duration?: number;
  video_status?: string;
}

interface TikTokVideoInfoResponse {
  list?: TikTokVideoInfoItem[];
}

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

  const { tiktokService } = resolveSessionServices(sdkContext);

  const { buffer, contentType, filename } = await downloadFileToBuffer(
    input.mediaUrl,
    600_000, // 10 min for large videos
    context
  );

  const fields: Record<string, string> = {};
  if (input.videoName) fields.video_name = input.videoName;

  const uploadResult = (await tiktokService.client.postMultipart(
    tiktokService.client.versionedPath("file/video/ad/upload/"),
    fields,
    "video_file",
    buffer,
    filename,
    contentType,
    context
  )) as TikTokVideoUploadResponse;

  const videoId = uploadResult.video_id;
  if (!videoId) {
    throw new McpError(
      JsonRpcErrorCode.InternalError,
      "TikTok video upload failed: no video_id returned"
    );
  }

  // Poll for bind_success status (max 10 min, 20s intervals)
  const maxAttempts = mcpConfig.tiktokVideoUploadMaxPollAttempts;
  const pollIntervalMs = mcpConfig.tiktokVideoUploadPollIntervalMs;

  try {
    const videoInfo = await pollUntilComplete<TikTokVideoInfoItem | undefined>({
      fetchStatus: async () => {
        const statusResult = (await tiktokService.client.get(
          tiktokService.client.versionedPath("file/video/ad/info/"),
          { video_ids: JSON.stringify([videoId]) },
          context
        )) as TikTokVideoInfoResponse;
        return statusResult.list?.[0];
      },
      isComplete: (info) => info?.video_status === "bind_success",
      isFailed: (info) => info?.video_status === "error" || info?.video_status === "deleted",
      initialDelayMs: pollIntervalMs,
      maxDelayMs: pollIntervalMs,
      maxAttempts,
      backoffFactor: 1,
    });
    return {
      videoId,
      videoName: videoInfo?.video_name ?? input.videoName,
      duration: videoInfo?.duration,
      uploadedAt: new Date().toISOString(),
      effect: buildUploadedEffect(videoId),
      dispatchedCapability,
    };
  } catch (error) {
    if (error instanceof ReportFailedError) {
      const status =
        (error.status as { video_status?: string } | undefined)?.video_status ?? "unknown";
      throw new McpError(
        JsonRpcErrorCode.InternalError,
        `TikTok video processing failed: status=${status}`
      );
    }
    if (error instanceof ReportTimeoutError) {
      throw new McpError(
        JsonRpcErrorCode.InternalError,
        `Video ${videoId} upload timed out: binding did not complete after ${maxAttempts} polling attempts (${(maxAttempts * pollIntervalMs) / 1000}s). The video may still be processing — check status manually.`
      );
    }
    throw error;
  }
}

function buildUploadedEffect(videoId: string): EffectResult {
  return {
    effectKind: "asset_uploaded",
    summary: { asset_type: ASSET_TYPE, asset_handle: videoId },
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
      text: `Video uploaded to TikTok!\n\nVideo ID: ${result.videoId}${result.videoName ? `\nName: ${result.videoName}` : ""}${result.duration !== undefined ? `\nDuration: ${result.duration}s` : ""}\n\nUse videoId in your ad creative payload`,
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
      platform: "tiktok",
      contractPlatformSlug: "tiktok",
      contractToolSlug: "upload_video",
      operation: ["upload"],
      // Effect-class: a media upload that creates an asset with no canonical entity snapshot.
      entityKinds: [],
      entityIdArgs: [],
      schemaVersion: 1,
      contractId: "tiktok.upload_video.v1",
      // `dry_run` = symbolic validate + symbolic effect projection. TikTok has no
      // native upload validate/preview, so both axes are symbolic (honest true).
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Upload a TikTok campaign video",
      input: {
        advertiserId: "1234567890",
        mediaUrl: "https://example.com/video.mp4",
        videoName: "Summer Campaign 2025",
      },
    },
  ],
  logic: uploadVideoLogic,
  responseFormatter: uploadVideoResponseFormatter,
};

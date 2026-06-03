// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
  downloadFileToBuffer,
  createLogger,
  fetchWithTimeout,
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

const ASSET_TYPE = "video";

const logger = createLogger("meta-upload-video");

const TOOL_NAME = "meta_upload_video";
const TOOL_TITLE = "Upload Video to Meta Ads";
const TOOL_DESCRIPTION = `Upload a video to Meta Ads Library from a URL.

The server downloads the video and uploads it to Meta's ad video library.
This tool uses a buffered proxy upload path, so it is intended for moderate-size assets rather than Meta's largest supported uploads.
Polls until processing is complete (up to 5 minutes).

**Video requirements:**
- Formats: MP4, MOV (H.264 codec recommended)
- Server safety limit: ${Math.round(mcpConfig.metaVideoUploadMaxBufferedBytes / (1024 * 1024))}MB buffered upload size
- Min resolution: 120x120px
- Recommended: 1080x1080px (square) or 1920x1080px (landscape)
- Duration: 1 second to 240 minutes

**Usage:** The returned videoId is used in adCreative → video_data → video_id`;

export const UploadVideoInputSchema = z
  .object({
    adAccountId: z.string().describe("Meta Ad Account ID (e.g., act_1234567890)"),
    mediaUrl: z.string().url().describe("Publicly accessible URL of the video to upload"),
    title: z.string().optional().describe("Optional video title"),
    description: z.string().optional().describe("Optional video description"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the upload request and returns an EffectDryRunResult under `dryRun` (expected effect = the would-be video upload) without downloading or uploading anything. No asset is created."
      ),
  })
  .describe("Parameters for uploading a video to Meta");

export const UploadVideoOutputSchema = z
  .object({
    videoId: z
      .string()
      .optional()
      .describe(
        "Video ID used in ad creative payloads. Absent on a dry_run (nothing was uploaded)."
      ),
    title: z.string().optional(),
    status: z.string().optional().describe("Processing status"),
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
  .describe("Uploaded video info");

type UploadVideoInput = z.infer<typeof UploadVideoInputSchema>;
type UploadVideoOutput = z.infer<typeof UploadVideoOutputSchema>;

interface MetaVideoUploadResponse {
  id: string;
  title?: string;
}

interface MetaVideoStatusResponse {
  status?: {
    processing_progress?: number;
    video_status?: string;
  };
}

async function getRemoteContentLength(
  url: string,
  context?: RequestContext
): Promise<number | undefined> {
  try {
    const response = await fetchWithTimeout(url, 30_000, context, { method: "HEAD" });
    if (!response.ok) {
      return undefined;
    }
    const contentLength = response.headers.get("content-length");
    if (!contentLength) {
      return undefined;
    }
    const parsedLength = Number(contentLength);
    return Number.isFinite(parsedLength) && parsedLength >= 0 ? parsedLength : undefined;
  } catch {
    return undefined;
  }
}

export async function uploadVideoLogic(
  input: UploadVideoInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<UploadVideoOutput> {
  // Effect-class write: no canonical entity snapshot. The capability is
  // `upload_video` with a null entity kind on every response.
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

  const { metaService } = resolveSessionServices(sdkContext);
  const maxBufferedBytes = mcpConfig.metaVideoUploadMaxBufferedBytes;
  const remoteContentLength = await getRemoteContentLength(input.mediaUrl, context);

  if (remoteContentLength !== undefined && remoteContentLength > maxBufferedBytes) {
    throw new McpError(
      JsonRpcErrorCode.InternalError,
      `Meta video upload aborted before download: remote file is ${remoteContentLength} bytes, exceeding the server's buffered upload limit of ${maxBufferedBytes} bytes. Use a smaller asset or a chunked upload workflow.`
    );
  }

  const { buffer, contentType, filename } = await downloadFileToBuffer(
    input.mediaUrl,
    300_000, // 5 min for large videos
    context
  );

  if (buffer.length > maxBufferedBytes) {
    throw new McpError(
      JsonRpcErrorCode.InternalError,
      `Meta video upload aborted after download: buffered file is ${buffer.length} bytes, exceeding the server's buffered upload limit of ${maxBufferedBytes} bytes. Use a smaller asset or a chunked upload workflow.`
    );
  }

  const actId = input.adAccountId.startsWith("act_")
    ? input.adAccountId
    : `act_${input.adAccountId}`;
  const fields: Record<string, string> = {};
  if (input.title) fields.title = input.title;
  if (input.description) fields.description = input.description;

  const uploadResult = (await metaService.graphApiClient.postMultipart(
    `/${actId}/advideos`,
    fields,
    "source",
    buffer,
    filename,
    contentType,
    context
  )) as MetaVideoUploadResponse;

  const videoId = uploadResult.id;
  if (!videoId) {
    throw new McpError(
      JsonRpcErrorCode.InternalError,
      "Meta video upload failed: no video ID returned"
    );
  }

  // Poll for processing completion. Note: transient transport/auth failures
  // propagate immediately — no silent retries.
  try {
    await pollUntilComplete<{ progress: number; videoStatus: string }>({
      fetchStatus: async () => {
        const statusResult = (await metaService.graphApiClient.get(
          `/${videoId}`,
          { fields: "status" },
          context
        )) as MetaVideoStatusResponse;
        return {
          progress: statusResult.status?.processing_progress ?? 0,
          videoStatus: statusResult.status?.video_status ?? "processing",
        };
      },
      isComplete: ({ progress, videoStatus }) => progress >= 100 || videoStatus === "ready",
      isFailed: ({ videoStatus }) => videoStatus === "error",
      initialDelayMs: mcpConfig.metaVideoUploadPollIntervalMs,
      maxDelayMs: mcpConfig.metaVideoUploadPollIntervalMs,
      maxAttempts: mcpConfig.metaVideoUploadMaxPollAttempts,
      backoffFactor: 1,
    });
    return {
      videoId,
      title: input.title ?? uploadResult.title,
      status: "ready",
      uploadedAt: new Date().toISOString(),
      effect: buildUploadedEffect(videoId),
      dispatchedCapability,
    };
  } catch (error) {
    if (error instanceof ReportFailedError) {
      throw new McpError(
        JsonRpcErrorCode.InternalError,
        `Meta video processing failed: status=error`
      );
    }
    if (error instanceof ReportTimeoutError) {
      logger.warn({ videoId }, "Meta video upload polling timed out — returning processing status");
      return {
        videoId,
        title: input.title ?? uploadResult.title,
        status: "processing",
        uploadedAt: new Date().toISOString(),
        effect: buildUploadedEffect(videoId),
        dispatchedCapability,
      };
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
      text: `Video uploaded to Meta!\n\nVideo ID: ${result.videoId}\nStatus: ${result.status}${result.title ? `\nTitle: ${result.title}` : ""}\n\nUse videoId in adCreative.video_data.video_id`,
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
      platform: "meta_ads",
      contractPlatformSlug: "meta",
      contractToolSlug: "upload_video",
      operation: ["upload"],
      // Effect-class: a media upload that creates an asset with no canonical entity snapshot.
      entityKinds: [],
      entityIdArgs: [],
      schemaVersion: 1,
      contractId: "meta.upload_video.v1",
      // `dry_run` = symbolic validate + symbolic effect projection. Meta has no
      // native upload validate/preview, so both axes are symbolic (honest true).
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Upload a campaign video",
      input: {
        adAccountId: "act_1234567890",
        mediaUrl: "https://example.com/summer-sale.mp4",
        title: "Summer Sale 2025",
      },
    },
  ],
  logic: uploadVideoLogic,
  responseFormatter: uploadVideoResponseFormatter,
};

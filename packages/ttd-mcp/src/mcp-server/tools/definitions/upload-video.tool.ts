// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
  downloadFileToBuffer,
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

const TOOL_NAME = "ttd_upload_video";
const TOOL_TITLE = "Upload a Hosted Video Creative to The Trade Desk";
const TOOL_DESCRIPTION = `Upload a video file to The Trade Desk and create a **TTD-hosted** video creative.

Unlike a third-party VAST creative (which references an externally-hosted VAST
tag via \`ttd_create_entity\`), this tool hosts the video *on* The Trade Desk. It
runs TTD's documented three-step flow for you:

1. \`POST /v3/creative/generateuploadurlforvideocreative\` — get a presigned upload URL.
2. \`PUT\` the downloaded video bytes to that URL.
3. \`POST /v3/creative\` (CreativeType \`Video\`) referencing the uploaded file.

**Video requirements:** MP4 (H.264) is the safest container/codec; supply the
creative's display \`width\`/\`height\` in pixels. The video must be reachable at a
public \`mediaUrl\` — the server downloads it, then uploads the bytes to TTD.

Returns the created \`CreativeId\`, which \`ttd_create_entity\` (entityType \`ad\`)
attaches to an ad group.`;

const ASSET_TYPE = "video";

export const UploadVideoInputSchema = z
  .object({
    advertiserId: z.string().min(1).describe("TTD platform ID of the owning advertiser"),
    mediaUrl: z.string().url().describe("Publicly accessible URL of the video file to upload"),
    creativeName: z.string().min(1).describe("Name of the creative (unique within the advertiser)"),
    width: z.number().int().positive().describe("Creative width in pixels"),
    height: z.number().int().positive().describe("Creative height in pixels"),
    adFormatId: z
      .string()
      .optional()
      .describe("Optional TTD Ad Format ID. Omit to let TTD infer from dimensions."),
    clickThroughUrl: z
      .string()
      .url()
      .optional()
      .describe("Optional landing-page click-through URL"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the request and returns an EffectDryRunResult under `dryRun` (expected effect = the would-be hosted video creative) without downloading, uploading, or creating anything."
      ),
  })
  .describe("Parameters for uploading a hosted video creative to The Trade Desk");

export const UploadVideoOutputSchema = z
  .object({
    creativeId: z
      .string()
      .optional()
      .describe(
        "The created CreativeId, for attaching to an ad group via `ttd_create_entity` (entityType `ad`). Absent on a dry_run."
      ),
    creative: z.record(z.any()).optional().describe("Raw POST /v3/creative response."),
    uploadedAt: z.string().datetime(),
    dryRun: EffectDryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. Nothing was uploaded or created."
    ),
    effect: EffectResultSchema.optional().describe(
      "Effect-class result identity (effectKind `asset_uploaded` + scalar audit summary). Present on a confirmed execute."
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "The concrete (operation, entityKind) this call resolved to — `upload` with `canonicalEntityKind: null` (effect class). Present on every response."
    ),
  })
  .describe("Uploaded The Trade Desk hosted video creative");

type UploadVideoInput = z.infer<typeof UploadVideoInputSchema>;
type UploadVideoOutput = z.infer<typeof UploadVideoOutputSchema>;

export async function uploadVideoLogic(
  input: UploadVideoInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<UploadVideoOutput> {
  const dispatchedCapability: DispatchedCapability = {
    operation: "upload",
    canonicalEntityKind: null,
  };

  // Symbolic dry-run: validate the request and project the would-be effect.
  // No download, no upload, no create.
  if (input.dry_run === true) {
    const dryRun = buildUploadEffectDryRun(input.mediaUrl);
    return {
      uploadedAt: new Date().toISOString(),
      dryRun,
      dispatchedCapability,
    };
  }

  const { ttdService } = resolveSessionServices(sdkContext);

  const { buffer, contentType, filename } = await downloadFileToBuffer(
    input.mediaUrl,
    300_000, // 5 min for large videos
    context
  );

  const creativeFields: Record<string, unknown> = {
    CreativeName: input.creativeName,
    Width: input.width,
    Height: input.height,
    ...(input.adFormatId ? { AdFormatId: input.adFormatId } : {}),
    ...(input.clickThroughUrl ? { ClickThroughUrl: input.clickThroughUrl } : {}),
  };

  const creative = await ttdService.uploadVideoCreative(
    input.advertiserId,
    filename,
    buffer,
    contentType,
    creativeFields,
    context
  );

  const creativeId = creative?.CreativeId;

  const effect: EffectResult = {
    effectKind: "asset_uploaded",
    summary: { asset_type: ASSET_TYPE, asset_handle: creativeId ?? "" },
  };

  return {
    ...(creativeId ? { creativeId } : {}),
    creative: creative as unknown as Record<string, unknown>,
    uploadedAt: new Date().toISOString(),
    effect,
    dispatchedCapability,
  };
}

/**
 * Symbolic effect dry-run for `upload_video`. Validates the request (mediaUrl
 * must be an http(s) URL — Zod's `.url()` admits other schemes) and projects
 * the would-be effect (a hosted video creative). TTD has no native
 * upload validate/preview, so both axes are symbolic. Pure (no I/O).
 */
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
          `Dry run: uploading a hosted ${ASSET_TYPE} creative ${verdict} (validation: ${validationSource}, expected-effect: ${expectedEffectSource}). Nothing was uploaded or created.` +
          (errs ? `\n${errs}` : "") +
          `\n\nTimestamp: ${result.uploadedAt}`,
      },
    ];
  }
  return [
    {
      type: "text" as const,
      text: `Hosted video creative created in The Trade Desk!\n\nCreativeId: ${result.creativeId}\n\nAttach it to an ad group with ttd_create_entity (entityType "ad").`,
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
      platform: "ttd",
      contractPlatformSlug: "ttd",
      contractToolSlug: "upload_video",
      operation: ["upload"],
      // Effect-class: uploads bytes + creates a hosted creative; no canonical
      // entity snapshot is captured for the effect.
      entityKinds: [],
      entityIdArgs: ["advertiserId"],
      schemaVersion: 1,
      contractId: "ttd.upload_video.v1",
      // `dry_run` = symbolic validate + symbolic effect projection. TTD has no
      // native asset-upload validate/preview, so both axes are symbolic.
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Upload a hosted 1920x1080 video creative",
      input: {
        advertiserId: "adv123",
        mediaUrl: "https://example.com/promo-15s.mp4",
        creativeName: "Summer Promo 15s",
        width: 1920,
        height: 1080,
      },
    },
  ],
  logic: uploadVideoLogic,
  responseFormatter: uploadVideoResponseFormatter,
};

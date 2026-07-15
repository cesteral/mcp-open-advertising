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

const TOOL_NAME = "amazon_dsp_upload_video";
const TOOL_TITLE = "Upload a Video Asset to Amazon DSP (Creative Asset Library)";
const TOOL_DESCRIPTION = `Upload a video file to Amazon's Creative Asset Library for use in Amazon DSP video creatives.

A DSP video creative references an \`assetId\` from the account's Creative Asset
Library. This tool runs Amazon's documented three-step upload flow for you:

1. \`POST /assets/upload\` — register a 15-minute presigned upload location.
2. \`PUT\` the downloaded video bytes to that URL.
3. \`POST /assets/register\` — register the uploaded file as a \`VIDEO\` asset.

The video must be reachable at a public \`mediaUrl\` — the server downloads it,
then uploads the bytes to Amazon. Returns the registered \`assetId\`, which a DSP
video creative (\`/dsp/creatives/video\`) references.`;

const ASSET_TYPE = "video";

export const UploadVideoInputSchema = z
  .object({
    name: z.string().min(1).describe("Asset name in the Creative Asset Library"),
    mediaUrl: z.string().url().describe("Publicly accessible URL of the video file to upload"),
    asinList: z
      .array(z.string())
      .optional()
      .describe("Optional ASINs to tag the asset with, to aid discovery/search"),
    tags: z.array(z.string()).optional().describe("Optional free-form tags for the asset"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the request and returns an EffectDryRunResult under `dryRun` (expected effect = the would-be video asset) without downloading, uploading, or registering anything."
      ),
  })
  .describe("Parameters for uploading a video asset to Amazon's Creative Asset Library");

export const UploadVideoOutputSchema = z
  .object({
    assetId: z
      .string()
      .optional()
      .describe(
        "The registered assetId, referenced by DSP video creatives. Absent on a dry_run (nothing was registered)."
      ),
    asset: z.record(z.any()).optional().describe("Raw /assets/register response."),
    uploadedAt: z.string().datetime(),
    dryRun: EffectDryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. Nothing was uploaded or registered."
    ),
    effect: EffectResultSchema.optional().describe(
      "Effect-class result identity (effectKind `asset_uploaded` + scalar audit summary). Present on a confirmed execute."
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "The concrete (operation, entityKind) this call resolved to — `upload` with `canonicalEntityKind: null` (effect class). Present on every response."
    ),
  })
  .describe("Uploaded Amazon DSP video asset");

type UploadVideoInput = z.infer<typeof UploadVideoInputSchema>;
type UploadVideoOutput = z.infer<typeof UploadVideoOutputSchema>;

// The DSP program context Amazon uses to scope an asset to DSP advertisers.
const DSP_PROGRAM_NAME = "AMAZON_DSP";

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
  // No download, no upload, no register.
  if (input.dry_run === true) {
    const dryRun = buildUploadEffectDryRun(input.mediaUrl);
    return {
      uploadedAt: new Date().toISOString(),
      dryRun,
      dispatchedCapability,
    };
  }

  const { amazonDspService } = resolveSessionServices(sdkContext);

  const { buffer, contentType, filename } = await downloadFileToBuffer(
    input.mediaUrl,
    300_000, // 5 min for large videos
    context
  );

  const registerFields: Record<string, unknown> = {
    name: input.name,
    assetType: "VIDEO",
    registrationContext: { programName: DSP_PROGRAM_NAME },
    ...(input.asinList ? { asinList: input.asinList } : {}),
    ...(input.tags ? { tags: input.tags } : {}),
  };

  const { asset } = await amazonDspService.uploadCreativeAsset(
    filename,
    buffer,
    contentType,
    registerFields,
    context
  );

  const assetId =
    (asset?.assetId as string | undefined) ?? (asset?.assetVersionId as string | undefined);

  const effect: EffectResult = {
    effectKind: "asset_uploaded",
    summary: { asset_type: ASSET_TYPE, asset_handle: assetId ?? "" },
  };

  return {
    ...(assetId ? { assetId } : {}),
    asset,
    uploadedAt: new Date().toISOString(),
    effect,
    dispatchedCapability,
  };
}

/**
 * Symbolic effect dry-run for `upload_video`. Validates the request (mediaUrl
 * must be an http(s) URL — Zod's `.url()` admits other schemes) and projects
 * the would-be effect (a video asset). Amazon has no native asset-upload
 * validate/preview, so both axes are symbolic. Pure (no I/O).
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
          `Dry run: uploading a ${ASSET_TYPE} asset ${verdict} (validation: ${validationSource}, expected-effect: ${expectedEffectSource}). Nothing was uploaded or registered.` +
          (errs ? `\n${errs}` : "") +
          `\n\nTimestamp: ${result.uploadedAt}`,
      },
    ];
  }
  return [
    {
      type: "text" as const,
      text: `Video asset registered in Amazon's Creative Asset Library!\n\nassetId: ${result.assetId}\n\nReference it from a DSP video creative.`,
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
      platform: "amazon_dsp",
      contractPlatformSlug: "amazon_dsp",
      contractToolSlug: "upload_video",
      operation: ["upload"],
      // Effect-class: uploads + registers an asset; no canonical entity snapshot.
      entityKinds: [],
      entityIdArgs: [],
      schemaVersion: 1,
      contractId: "amazon_dsp.upload_video.v1",
      // `dry_run` = symbolic validate + symbolic effect projection. Amazon has no
      // native asset-upload validate/preview, so both axes are symbolic.
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Upload a video asset for DSP creatives",
      input: {
        name: "Summer Promo 15s",
        mediaUrl: "https://example.com/promo-15s.mp4",
      },
    },
  ],
  logic: uploadVideoLogic,
  responseFormatter: uploadVideoResponseFormatter,
};

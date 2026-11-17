// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
  downloadFileToBuffer,
  CreativeAssetRefSchema,
  resolveCreativeAsset,
  checkCreativeAssetLimits,
  ensureFilenameExtension,
  assertGovernedEffectDryRun,
  EffectResultSchema,
  EffectDryRunResultSchema,
  DispatchedCapabilitySchema,
  NO_UNTRUSTED_CONTENT,
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
  CreativeAssetRef,
  CreativeAssetPlatformLimits,
} from "@cesteral/shared";

const TOOL_NAME = "dv360_upload_image";
const TOOL_TITLE = "Upload Image to DV360";
const TOOL_DESCRIPTION = `Upload an image asset to a DV360 advertiser from a URL.

The server downloads the image and uploads it via the DV360 asset upload API.
Returns the assetId which can be used when creating creatives.

**Image requirements:**
- Formats: JPEG, PNG, GIF, WEBP
- Check DV360 creative specs for size/dimension requirements per creative type

**Usage:** The returned assetId is used when creating or updating DV360 creatives.`;

const ASSET_TYPE = "image";

/** What DV360 accepts for this upload; a media-library `asset` is checked against it before anything is fetched. */
const ASSET_LIMITS: CreativeAssetPlatformLimits = {
  platform: "DV360",
  allowedContentTypes: ["image/jpeg", "image/png", "image/gif", "image/webp"],
  maxBytes: 10 * 1024 * 1024,
};

/** `dry_run` is the only argument outside the write's identity; `asset` stays in the executable args so the decision token binds the exact asset. */
const EXECUTABLE_ARGS_EXCLUDE = ["dry_run"];

export const UploadImageInputSchema = z
  .object({
    advertiserId: z.string().describe("DV360 Advertiser ID"),
    mediaUrl: z
      .string()
      .url()
      .optional()
      .describe(
        "Publicly accessible URL of the image to upload. Give exactly one of `mediaUrl` or `asset`."
      ),
    asset: CreativeAssetRefSchema.optional().describe(
      "A media-library asset to upload instead of a URL. The server fetches its bytes at execution only (never on dry_run); the call carries no URL. Give exactly one of `mediaUrl` or `asset`."
    ),
    name: z.string().optional().describe("Optional name for the uploaded asset"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the upload request and returns an EffectDryRunResult under `dryRun` (expected effect = the would-be image upload) without downloading or uploading anything. No asset is created."
      ),
  })
  .superRefine((value, ctx) => {
    if ((value.mediaUrl === undefined) === (value.asset === undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide exactly one of `mediaUrl` or `asset`",
        path: [value.asset === undefined ? "mediaUrl" : "asset"],
      });
    }
  })
  .describe("Parameters for uploading an image to DV360");

export const UploadImageOutputSchema = z
  .object({
    assetId: z
      .string()
      .optional()
      .describe(
        "DV360 asset media ID for use in creative payloads. Absent on a dry_run (nothing was uploaded)."
      ),
    name: z.string().optional().describe("Asset name"),
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
  .describe("Uploaded image asset info");

type UploadImageInput = z.infer<typeof UploadImageInputSchema>;
type UploadImageOutput = z.infer<typeof UploadImageOutputSchema>;

export async function uploadImageLogic(
  input: UploadImageInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<UploadImageOutput> {
  // Effect-class write: no canonical entity snapshot. The capability is
  // `upload` with a null entity kind on every response.
  const dispatchedCapability: DispatchedCapability = {
    operation: "upload",
    canonicalEntityKind: null,
  };

  // Symbolic dry-run: validate the request and project the would-be effect
  // (an image asset upload). No download, no API call.
  if (input.dry_run === true) {
    const dryRun = buildUploadEffectDryRun(input);
    return {
      uploadedAt: new Date().toISOString(),
      dryRun,
      dispatchedCapability,
    };
  }

  const { dv360Service } = resolveSessionServices(sdkContext);

  // A media-library asset is resolved through the control plane with this call's
  // decision token; a URL is downloaded as before.
  const { buffer, contentType, filename } = input.asset
    ? await resolveCreativeAsset({
        asset: input.asset,
        executableArgsExclude: EXECUTABLE_ARGS_EXCLUDE,
        parsedArgs: input,
        limits: ASSET_LIMITS,
        context,
      })
    : await downloadFileToBuffer(input.mediaUrl as string, 120_000, context);

  // DV360 rejects uploads when the filename lacks an extension
  // (ASSET_UNKNOWN_FILE_EXTENSION). If the caller supplied a friendly name,
  // borrow an extension from the response content-type.
  const effectiveName = ensureFilenameExtension(input.name ?? filename, contentType);

  const result = await dv360Service.uploadAsset(
    input.advertiserId,
    buffer,
    effectiveName,
    contentType,
    context
  );

  const effect: EffectResult = {
    effectKind: "asset_uploaded",
    summary: { asset_type: ASSET_TYPE, asset_handle: result.asset.mediaId },
  };

  return {
    assetId: result.asset.mediaId,
    name: effectiveName,
    uploadedAt: new Date().toISOString(),
    effect,
    dispatchedCapability,
  };
}

/**
 * Symbolic effect dry-run for `upload_image`. Validates the request (mediaUrl
 * must be an http(s) URL — Zod's `.url()` admits other schemes like ftp://) and
 * projects the would-be effect (an image asset upload). The upload fetches the
 * URL and streams it upstream — there is no native validate/preview — so both
 * axes are symbolic. Pure (no I/O: no download, no upload). */
function buildUploadEffectDryRun(input: {
  mediaUrl?: string;
  asset?: CreativeAssetRef;
}): EffectDryRunResult {
  const { mediaUrl, asset } = input;
  // An asset reference is checked against the platform's limits from its own
  // fields: nothing is resolved or fetched on a dry run.
  const validationErrors: DryRunValidationError[] = asset
    ? checkCreativeAssetLimits(asset, ASSET_LIMITS)
    : [];
  let protocolOk = true;
  if (mediaUrl !== undefined) {
    try {
      const parsed = new URL(mediaUrl);
      protocolOk = parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      protocolOk = false;
    }
  }
  if (!protocolOk) {
    validationErrors.push({
      code: "INVALID_MEDIA_URL",
      message: `mediaUrl must be an http(s) URL — got "${mediaUrl ?? ""}"`,
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

export function uploadImageResponseFormatter(result: UploadImageOutput): McpTextContent[] {
  if (result.dryRun) {
    const { wouldSucceed, validationErrors, validationSource, expectedEffectSource } =
      result.dryRun;
    const verdict = wouldSucceed ? "would succeed" : "would FAIL";
    const errs = validationErrors.map((e) => `  - [${e.code}] ${e.message}`).join("\n");
    return [
      {
        type: "text" as const,
        text:
          `Dry run: uploading an ${ASSET_TYPE} ${verdict} (validation: ${validationSource}, expected-effect: ${expectedEffectSource}). No asset was uploaded.` +
          (errs ? `\n${errs}` : "") +
          `\n\nTimestamp: ${result.uploadedAt}`,
      },
    ];
  }
  return [
    {
      type: "text" as const,
      text: [
        "Image uploaded to DV360!",
        "",
        `Asset ID: ${result.assetId}`,
        `Name: ${result.name}`,
        `Uploaded: ${result.uploadedAt}`,
        "",
        "Use assetId when creating or updating DV360 creatives.",
      ].join("\n"),
    },
  ];
}

export const uploadImageTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: UploadImageInputSchema,
  outputSchema: UploadImageOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: true,
    idempotentHint: false,
    destructiveHint: true,
    cesteral: {
      kind: "write",
      writeClass: "effect",
      executableArgsExclude: EXECUTABLE_ARGS_EXCLUDE,
      platform: "dv360",
      contractPlatformSlug: "dv360",
      contractToolSlug: "upload_image",
      operation: ["upload"],
      // Effect-class: a media upload that creates an asset with no canonical entity snapshot.
      entityKinds: [],
      entityIdArgs: [],
      schemaVersion: 1,
      contractId: "dv360.upload_image.v1",
      // `dry_run` = symbolic validate + symbolic effect projection. DV360 has no
      // native upload validate/preview, so both axes are symbolic (honest true).
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Upload a banner image",
      input: {
        advertiserId: "1234567890",
        mediaUrl: "https://example.com/banner-728x90.jpg",
        name: "Summer Campaign Banner",
      },
    },
  ],
  logic: uploadImageLogic,
  responseFormatter: uploadImageResponseFormatter,
  // Output is the platform-generated asset id plus the locally derived filename (caller input or its own URL); no platform text.
  untrustedContent: NO_UNTRUSTED_CONTENT,
};

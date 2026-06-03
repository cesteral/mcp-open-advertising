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

const TOOL_NAME = "linkedin_upload_image";
const TOOL_TITLE = "Upload Image to LinkedIn Ads";
const TOOL_DESCRIPTION = `Upload an image to LinkedIn Ads from a URL.

The server downloads the image and uploads it to LinkedIn's Digital Media Assets library.
Uses LinkedIn's 3-step upload flow: register → upload binary → confirm.

**Image requirements:**
- Formats: JPEG, PNG, GIF
- Min: 400x400px (Sponsored Content), recommended 1200x627px
- Max file size: 5MB
- Aspect ratios: 1.91:1 (horizontal), 1:1 (square), 2:3 (vertical)

**Usage:** The returned assetUrn is referenced in creative → content → media → reference`;

const ASSET_TYPE = "image";

export const UploadImageInputSchema = z
  .object({
    adAccountUrn: z
      .string()
      .describe("LinkedIn Ad Account URN (e.g., urn:li:sponsoredAccount:123456)"),
    mediaUrl: z.string().url().describe("Publicly accessible URL of the image to upload"),
    filename: z.string().optional().describe("Override filename"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the upload request and returns an EffectDryRunResult under `dryRun` (expected effect = the would-be image upload) without downloading or uploading anything. No asset is created."
      ),
  })
  .describe("Parameters for uploading an image to LinkedIn");

export const UploadImageOutputSchema = z
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
  .describe("Uploaded LinkedIn image asset");

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
      recipes: ["urn:li:digitalmediaRecipe:ads-image"],
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

  // Step 2: Download file and PUT binary
  const { buffer, contentType } = await downloadFileToBuffer(input.mediaUrl, 120_000, context);

  const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
  if (buffer.length > MAX_IMAGE_SIZE) {
    throw new McpError(
      JsonRpcErrorCode.InternalError,
      `Image file too large: ${(buffer.length / 1024 / 1024).toFixed(1)}MB exceeds LinkedIn's 5MB limit`
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
 * Symbolic effect dry-run for `upload_image`. Validates the request (mediaUrl
 * must be an http(s) URL — Zod's `.url()` admits other schemes like ftp://) and
 * projects the would-be effect (an image asset upload). The upload fetches the
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
      text: `Image uploaded to LinkedIn!\n\nAsset URN: ${result.assetUrn}\n\nUse assetUrn in creative.content.media.reference for Sponsored Content.`,
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
      executableArgsExclude: ["dry_run"],
      platform: "linkedin_ads",
      contractPlatformSlug: "linkedin_ads",
      contractToolSlug: "upload_image",
      operation: ["upload"],
      // Effect-class: a media upload that creates an asset with no canonical entity snapshot.
      entityKinds: [],
      entityIdArgs: [],
      schemaVersion: 1,
      contractId: "linkedin_ads.upload_image.v1",
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
      label: "Upload a banner image for LinkedIn ads",
      input: {
        adAccountUrn: "urn:li:sponsoredAccount:123456",
        mediaUrl: "https://example.com/banner-1200x627.jpg",
      },
    },
  ],
  logic: uploadImageLogic,
  responseFormatter: uploadImageResponseFormatter,
};

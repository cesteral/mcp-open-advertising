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

const TOOL_NAME = "meta_upload_image";
const TOOL_TITLE = "Upload Image to Meta Ads";
const TOOL_DESCRIPTION = `Upload an image to Meta Ads Library from a URL.

The server downloads the image and uploads it to Meta's ad image library.
Returns the image hash which can be used in ad creative payloads.

**Image requirements:**
- Formats: JPEG, PNG, GIF
- Max file size: 30MB
- Recommended: 1200x628px (1.91:1 ratio) for link ads
- Square 1080x1080px for Stories/Reels

**Usage:** The returned imageHash is used in adCreative → object_story_spec → link_data → image_hash`;

const ASSET_TYPE = "image";

export const UploadImageInputSchema = z
  .object({
    adAccountId: z.string().describe("Meta Ad Account ID (e.g., act_1234567890)"),
    mediaUrl: z.string().url().describe("Publicly accessible URL of the image to upload"),
    name: z.string().optional().describe("Optional name for the image in Media Library"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the upload request and returns an EffectDryRunResult under `dryRun` (expected effect = the would-be image upload) without downloading or uploading anything. No asset is created."
      ),
  })
  .describe("Parameters for uploading an image to Meta");

export const UploadImageOutputSchema = z
  .object({
    imageHash: z
      .string()
      .optional()
      .describe(
        "Image hash used in ad creative payloads. Absent on a dry_run (nothing was uploaded)."
      ),
    name: z.string().optional().describe("Image name in Media Library"),
    url: z.string().optional().describe("Preview URL of the uploaded image"),
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
  .describe("Uploaded image info");

type UploadImageInput = z.infer<typeof UploadImageInputSchema>;
type UploadImageOutput = z.infer<typeof UploadImageOutputSchema>;

interface MetaImageUploadResponse {
  images?: {
    [filename: string]: {
      hash: string;
      url: string;
      name?: string;
    };
  };
}

export async function uploadImageLogic(
  input: UploadImageInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<UploadImageOutput> {
  // Effect-class write: no canonical entity snapshot. The capability is
  // `upload_image` with a null entity kind on every response.
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

  const { metaService } = resolveSessionServices(sdkContext);

  const { buffer, contentType, filename } = await downloadFileToBuffer(
    input.mediaUrl,
    120_000,
    context
  );

  const actId = input.adAccountId.startsWith("act_")
    ? input.adAccountId
    : `act_${input.adAccountId}`;
  const effectiveName = input.name ?? filename;
  const fields: Record<string, string> = {};
  if (input.name) fields.name = input.name;

  const result = (await metaService.graphApiClient.postMultipart(
    `/${actId}/adimages`,
    fields,
    "bytes",
    buffer,
    effectiveName,
    contentType,
    context
  )) as MetaImageUploadResponse;

  const images = result.images ?? {};
  const imageEntry = Object.values(images)[0];
  if (!imageEntry) {
    throw new McpError(
      JsonRpcErrorCode.InternalError,
      "Meta image upload failed: no image data returned"
    );
  }

  const effect: EffectResult = {
    effectKind: "asset_uploaded",
    summary: { asset_type: ASSET_TYPE, asset_handle: imageEntry.hash },
  };

  return {
    imageHash: imageEntry.hash,
    name: imageEntry.name ?? effectiveName,
    url: imageEntry.url,
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
      text: `Image uploaded to Meta!\n\nImage Hash: ${result.imageHash}\nName: ${result.name}${result.url ? `\nPreview URL: ${result.url}` : ""}\n\nUse imageHash in adCreative.object_story_spec.link_data.image_hash`,
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
    destructiveHint: false,
    cesteral: {
      kind: "write",
      writeClass: "effect",
      executableArgsExclude: ["dry_run"],
      platform: "meta_ads",
      contractPlatformSlug: "meta",
      contractToolSlug: "upload_image",
      operation: ["upload"],
      // Effect-class: a media upload that creates an asset with no canonical entity snapshot.
      entityKinds: [],
      entityIdArgs: [],
      schemaVersion: 1,
      contractId: "meta.upload_image.v1",
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
      label: "Upload a banner image",
      input: {
        adAccountId: "act_1234567890",
        mediaUrl: "https://example.com/banner-1200x628.jpg",
        name: "Summer Sale Banner",
      },
    },
  ],
  logic: uploadImageLogic,
  responseFormatter: uploadImageResponseFormatter,
};

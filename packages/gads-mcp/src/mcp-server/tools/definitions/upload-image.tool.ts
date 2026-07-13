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

const TOOL_NAME = "gads_upload_image";
const TOOL_TITLE = "Upload Image Asset to Google Ads";
const TOOL_DESCRIPTION = `Upload an image to Google Ads as an ImageAsset from a URL.

The server downloads the image and creates an ImageAsset via AssetService (\`assets:mutate\`,
base64 \`imageAsset.data\`). The returned asset resource name is referenced by image ads and
extensions. This is a convenience wrapper over \`gads_create_entity\` (entityType \`asset\`) that
handles the download + base64 encoding for you.

**Image requirements:**
- Formats: JPEG, PNG, GIF
- Max file size: 5MB

Note: Google Ads has no binary video upload — video assets reference a YouTube video ID, so
create them with \`gads_create_entity\` (entityType \`asset\`, \`youtubeVideoAsset\`).`;

const ASSET_TYPE = "image";
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

/** Map a downloaded content type to the Google Ads ImageMimeType enum. */
function toImageMimeType(contentType: string): string | undefined {
  const ct = contentType.toLowerCase();
  if (ct.includes("jpeg") || ct.includes("jpg")) return "IMAGE_JPEG";
  if (ct.includes("png")) return "IMAGE_PNG";
  if (ct.includes("gif")) return "IMAGE_GIF";
  return undefined;
}

export const UploadImageInputSchema = z
  .object({
    customerId: z
      .string()
      .regex(/^\d+$/, "Customer ID must contain only digits (no dashes)")
      .describe("Google Ads customer ID (no dashes)"),
    name: z.string().min(1).describe("Asset name (unique within the account)"),
    mediaUrl: z.string().url().describe("Publicly accessible URL of the image to upload"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the upload request and returns an EffectDryRunResult under `dryRun` (expected effect = the would-be image asset) without downloading or creating anything. No asset is created."
      ),
  })
  .describe("Parameters for uploading an image asset to Google Ads");

export const UploadImageOutputSchema = z
  .object({
    resourceName: z
      .string()
      .optional()
      .describe(
        "Asset resource name (customers/{id}/assets/{assetId}) for use in image ads/extensions. Absent on a dry_run (nothing was created)."
      ),
    result: z.record(z.any()).optional().describe("Raw AssetService mutate response."),
    uploadedAt: z.string().datetime(),
    dryRun: EffectDryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. No asset was created."
    ),
    effect: EffectResultSchema.optional().describe(
      "Effect-class result identity (effectKind `asset_uploaded` + scalar audit summary). Present on a confirmed execute. Effect writes carry no canonical entity snapshot."
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "The concrete (operation, entityKind) this call resolved to — `upload` with `canonicalEntityKind: null` (effect class). Present on every response."
    ),
  })
  .describe("Uploaded Google Ads image asset");

type UploadImageInput = z.infer<typeof UploadImageInputSchema>;
type UploadImageOutput = z.infer<typeof UploadImageOutputSchema>;

export async function uploadImageLogic(
  input: UploadImageInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<UploadImageOutput> {
  const dispatchedCapability: DispatchedCapability = {
    operation: "upload",
    canonicalEntityKind: null,
  };

  // Symbolic dry-run: validate the request and project the would-be effect.
  // No download, no API call.
  if (input.dry_run === true) {
    const dryRun = buildUploadEffectDryRun(input.mediaUrl);
    return {
      uploadedAt: new Date().toISOString(),
      dryRun,
      dispatchedCapability,
    };
  }

  const { gadsService } = resolveSessionServices(sdkContext);

  const { buffer, contentType } = await downloadFileToBuffer(input.mediaUrl, 120_000, context);
  if (buffer.length > MAX_IMAGE_SIZE) {
    throw new McpError(
      JsonRpcErrorCode.InternalError,
      `Image file too large: ${(buffer.length / 1024 / 1024).toFixed(1)}MB exceeds Google Ads' 5MB limit`
    );
  }
  const mimeType = toImageMimeType(contentType);
  if (!mimeType) {
    throw new McpError(
      JsonRpcErrorCode.InvalidParams,
      `Unsupported image content type "${contentType}" — Google Ads image assets must be JPEG, PNG, or GIF`
    );
  }

  const result = (await gadsService.createEntity(
    "asset",
    input.customerId,
    {
      name: input.name,
      type: "IMAGE",
      imageAsset: { data: buffer.toString("base64"), mimeType },
    },
    context
  )) as { results?: Array<{ resourceName?: string }> };

  const resourceName = result?.results?.[0]?.resourceName;

  const effect: EffectResult = {
    effectKind: "asset_uploaded",
    summary: { asset_type: ASSET_TYPE, asset_handle: resourceName ?? "" },
  };

  return {
    ...(resourceName ? { resourceName } : {}),
    result: result as Record<string, unknown>,
    uploadedAt: new Date().toISOString(),
    effect,
    dispatchedCapability,
  };
}

/**
 * Symbolic effect dry-run for `upload_image`. Validates the request (mediaUrl
 * must be an http(s) URL — Zod's `.url()` admits other schemes) and projects
 * the would-be effect (an image asset). The upload fetches the URL and streams
 * it upstream — there is no native validate/preview — so both axes are
 * symbolic. Pure (no I/O: no download, no create).
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
          `Dry run: uploading an ${ASSET_TYPE} asset ${verdict} (validation: ${validationSource}, expected-effect: ${expectedEffectSource}). No asset was created.` +
          (errs ? `\n${errs}` : "") +
          `\n\nTimestamp: ${result.uploadedAt}`,
      },
    ];
  }
  return [
    {
      type: "text" as const,
      text: `Image asset created in Google Ads!\n\nResource name: ${result.resourceName}\n\nReference it in image ads/extensions by this resource name.`,
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
      platform: "google_ads",
      contractPlatformSlug: "gads",
      contractToolSlug: "upload_image",
      operation: ["upload"],
      // Effect-class: creates an asset with no canonical entity snapshot.
      entityKinds: [],
      entityIdArgs: ["customerId"],
      schemaVersion: 1,
      contractId: "gads.upload_image.v1",
      // `dry_run` = symbolic validate + symbolic effect projection. Google Ads
      // has no native asset-upload validate/preview, so both axes are symbolic.
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Upload a banner image asset",
      input: {
        customerId: "1234567890",
        name: "Summer Banner 1200x628",
        mediaUrl: "https://example.com/banner-1200x628.jpg",
      },
    },
  ],
  logic: uploadImageLogic,
  responseFormatter: uploadImageResponseFormatter,
};

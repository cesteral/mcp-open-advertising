// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
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

const TOOL_NAME = "gads_upload_video";
const TOOL_TITLE = "Create a Video Asset in Google Ads";
const TOOL_DESCRIPTION = `Create a video asset in Google Ads from a YouTube video ID.

**Google Ads has no binary video upload.** Unlike image assets (which accept raw
bytes via \`gads_upload_image\`), a Google Ads video asset is a \`YouTubeVideoAsset\`
that *references* a video already hosted on YouTube — you provide the YouTube
video ID, not a file. Host the video on YouTube first, then pass its ID here.

This tool creates the asset via AssetService (\`assets:mutate\`, \`type: YOUTUBE_VIDEO\`,
\`youtubeVideoAsset.youtubeVideoId\`) and returns the asset resource name, which video
ads (\`VIDEO_RESPONSIVE_AD\`, bumper, in-stream, etc.) reference. It is a convenience
wrapper over \`gads_create_entity\` (entityType \`asset\`) that fixes the asset type and
shape for you.

**Requirements:**
- The video must already be uploaded to YouTube and be public or unlisted.
- \`youtubeVideoId\` is the 11-character ID from the watch URL
  (\`https://www.youtube.com/watch?v=<id>\`), not the full URL.`;

const ASSET_TYPE = "video";

// YouTube video IDs are 11 characters from the URL-safe base64 alphabet.
const YOUTUBE_VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export const UploadVideoInputSchema = z
  .object({
    customerId: z
      .string()
      .regex(/^\d+$/, "Customer ID must contain only digits (no dashes)")
      .describe("Google Ads customer ID (no dashes)"),
    name: z.string().min(1).describe("Asset name (unique within the account)"),
    youtubeVideoId: z
      .string()
      .regex(
        YOUTUBE_VIDEO_ID_RE,
        "Must be the 11-character YouTube video ID (the `v=` value from the watch URL), not the full URL"
      )
      .describe(
        "The 11-character YouTube video ID (e.g. `dQw4w9WgXcQ`) of a public/unlisted video already hosted on YouTube"
      ),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the request and returns an EffectDryRunResult under `dryRun` (expected effect = the would-be video asset) without creating anything. No asset is created."
      ),
  })
  .describe("Parameters for creating a YouTube video asset in Google Ads");

export const UploadVideoOutputSchema = z
  .object({
    resourceName: z
      .string()
      .optional()
      .describe(
        "Asset resource name (customers/{id}/assets/{assetId}) for use in video ads. Absent on a dry_run (nothing was created)."
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
  .describe("Created Google Ads video asset");

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
  // No API call.
  if (input.dry_run === true) {
    const dryRun = buildUploadEffectDryRun(input.youtubeVideoId);
    return {
      uploadedAt: new Date().toISOString(),
      dryRun,
      dispatchedCapability,
    };
  }

  const { gadsService } = resolveSessionServices(sdkContext);

  const result = (await gadsService.createEntity(
    "asset",
    input.customerId,
    {
      name: input.name,
      type: "YOUTUBE_VIDEO",
      youtubeVideoAsset: { youtubeVideoId: input.youtubeVideoId, youtubeVideoTitle: input.name },
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
 * Symbolic effect dry-run for `upload_video`. Validates the request (the
 * YouTube video ID must be a well-formed 11-character ID) and projects the
 * would-be effect (a video asset). Google Ads has no native asset-create
 * validate/preview, so both axes are symbolic. Pure (no I/O).
 */
function buildUploadEffectDryRun(youtubeVideoId: string): EffectDryRunResult {
  const validationErrors: DryRunValidationError[] = [];
  if (!YOUTUBE_VIDEO_ID_RE.test(youtubeVideoId)) {
    validationErrors.push({
      code: "INVALID_YOUTUBE_VIDEO_ID",
      message: `youtubeVideoId must be the 11-character YouTube video ID — got "${youtubeVideoId}"`,
      field: "youtubeVideoId",
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
          `Dry run: creating a ${ASSET_TYPE} asset ${verdict} (validation: ${validationSource}, expected-effect: ${expectedEffectSource}). No asset was created.` +
          (errs ? `\n${errs}` : "") +
          `\n\nTimestamp: ${result.uploadedAt}`,
      },
    ];
  }
  return [
    {
      type: "text" as const,
      text: `Video asset created in Google Ads!\n\nResource name: ${result.resourceName}\n\nReference it in video ads by this resource name.`,
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
      platform: "google_ads",
      contractPlatformSlug: "gads",
      contractToolSlug: "upload_video",
      operation: ["upload"],
      // Effect-class: creates an asset with no canonical entity snapshot.
      entityKinds: [],
      entityIdArgs: ["customerId"],
      schemaVersion: 1,
      contractId: "gads.upload_video.v1",
      // `dry_run` = symbolic validate + symbolic effect projection. Google Ads
      // has no native asset-create validate/preview, so both axes are symbolic.
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Create a video asset from a YouTube video ID",
      input: {
        customerId: "1234567890",
        name: "Summer Launch 15s",
        youtubeVideoId: "dQw4w9WgXcQ",
      },
    },
  ],
  logic: uploadVideoLogic,
  responseFormatter: uploadVideoResponseFormatter,
};

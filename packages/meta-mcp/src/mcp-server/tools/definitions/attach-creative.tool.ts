// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
  McpError,
  JsonRpcErrorCode,
  NO_UNTRUSTED_CONTENT,
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

const TOOL_NAME = "meta_attach_creative";
const TOOL_TITLE = "Attach Uploaded Media to a Meta Ad Set";
const TOOL_DESCRIPTION = `Attach media already uploaded with meta_upload_image or meta_upload_video to an ad set, by creating one PAUSED ad whose creative is written inline.

Give the media handle the upload returned: \`imageHash\` for an image, or \`videoId\` for a video (a video also needs a thumbnail: \`thumbnailImageHash\` or \`thumbnailUrl\`). The creative's object_story_spec is built from \`pageId\`, \`link\`, \`message\`, \`headline\`, \`description\` and \`callToActionType\`.

The ad is always created with status PAUSED, so nothing starts spending; activate it with meta_update_entity. Returns the new ad's id.`;

/** `dry_run` is the only argument outside the write's identity. */
const EXECUTABLE_ARGS_EXCLUDE = ["dry_run"];

const EFFECT_KIND = "creative_attached";

/** Meta numeric node ids (ad set, page) are sent as unsigned ints. */
const NUMERIC_ID = /^\d+$/;
const CALL_TO_ACTION_TYPE = /^[A-Z][A-Z0-9_]*$/;

export const AttachCreativeInputSchema = z
  .object({
    adAccountId: z.string().min(1).describe("Meta Ad Account ID (e.g., act_1234567890)"),
    adSetId: z.string().min(1).describe("ID of the ad set the new ad is created in"),
    name: z.string().min(1).describe("Name of the new ad (also used as the creative's name)"),
    pageId: z.string().min(1).describe("Facebook Page ID the ad is published as"),
    imageHash: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Image hash returned by meta_upload_image. Give exactly one of `imageHash` or `videoId`."
      ),
    videoId: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Video ID returned by meta_upload_video. Give exactly one of `imageHash` or `videoId`."
      ),
    thumbnailImageHash: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Video only: image hash of the thumbnail. A video needs exactly one of `thumbnailImageHash` or `thumbnailUrl`."
      ),
    thumbnailUrl: z
      .url()
      .optional()
      .describe(
        "Video only: URL of the thumbnail image. A video needs exactly one of `thumbnailImageHash` or `thumbnailUrl`."
      ),
    link: z.url().describe("Destination URL people reach from the ad"),
    message: z.string().min(1).optional().describe("Primary text shown above the media"),
    headline: z
      .string()
      .min(1)
      .optional()
      .describe("Headline (link_data.name for an image, video_data.title for a video)"),
    description: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Description (link_data.description for an image, video_data.link_description for a video)"
      ),
    callToActionType: z
      .string()
      .optional()
      .describe(
        "Call-to-action button type, e.g. LEARN_MORE or SHOP_NOW. A video always carries a call to action (default LEARN_MORE) because its link travels in it."
      ),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the request and returns an EffectDryRunResult under `dryRun` (expected effect = the would-be attach) without calling Meta. No ad is created."
      ),
  })
  .superRefine((value, ctx) => {
    if ((value.imageHash === undefined) === (value.videoId === undefined)) {
      ctx.addIssue({
        code: "custom",
        message: "Provide exactly one of `imageHash` or `videoId`",
        path: [value.imageHash === undefined ? "imageHash" : "videoId"],
      });
    }
    const thumbnails = [value.thumbnailImageHash, value.thumbnailUrl].filter(
      (t) => t !== undefined
    ).length;
    if (value.videoId !== undefined && thumbnails !== 1) {
      ctx.addIssue({
        code: "custom",
        message: "A video needs exactly one of `thumbnailImageHash` or `thumbnailUrl`",
        path: ["thumbnailImageHash"],
      });
    }
    if (value.imageHash !== undefined && thumbnails !== 0) {
      ctx.addIssue({
        code: "custom",
        message: "`thumbnailImageHash` and `thumbnailUrl` apply to a video only",
        path: ["thumbnailImageHash"],
      });
    }
  })
  .describe("Parameters for attaching uploaded media to a Meta ad set");

export const AttachCreativeOutputSchema = z
  .object({
    adId: z
      .string()
      .optional()
      .describe("ID of the created ad. Absent on a dry_run (nothing was created)."),
    adSetId: z.string().describe("The ad set the ad was (or would be) created in"),
    status: z.literal("PAUSED").describe("The status the ad is created with"),
    attachedAt: z.string().datetime(),
    dryRun: EffectDryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. No ad was created."
    ),
    effect: EffectResultSchema.optional().describe(
      "Effect-class result identity (effectKind `creative_attached` + scalar audit summary). Present on a confirmed execute."
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "The concrete (operation, entityKind) this call resolved to — `create` with `canonicalEntityKind: null` (effect class). Present on every response."
    ),
  })
  .describe("Attached creative info");

type AttachCreativeInput = z.infer<typeof AttachCreativeInputSchema>;
type AttachCreativeOutput = z.infer<typeof AttachCreativeOutputSchema>;

function assetType(input: AttachCreativeInput): "image" | "video" {
  return input.videoId !== undefined ? "video" : "image";
}

function assetHandle(input: AttachCreativeInput): string {
  return (input.videoId ?? input.imageHash) as string;
}

/**
 * The `object_story_spec` of the inline creative: `link_data` for an image,
 * `video_data` for a video (whose link travels in its call to action).
 */
export function buildObjectStorySpec(input: AttachCreativeInput): Record<string, unknown> {
  if (input.videoId !== undefined) {
    const videoData: Record<string, unknown> = {
      video_id: input.videoId,
      call_to_action: {
        type: input.callToActionType ?? "LEARN_MORE",
        value: { link: input.link },
      },
    };
    if (input.thumbnailImageHash !== undefined) videoData.image_hash = input.thumbnailImageHash;
    if (input.thumbnailUrl !== undefined) videoData.image_url = input.thumbnailUrl;
    if (input.message !== undefined) videoData.message = input.message;
    if (input.headline !== undefined) videoData.title = input.headline;
    if (input.description !== undefined) videoData.link_description = input.description;
    return { page_id: input.pageId, video_data: videoData };
  }
  const linkData: Record<string, unknown> = {
    image_hash: input.imageHash,
    link: input.link,
  };
  if (input.message !== undefined) linkData.message = input.message;
  if (input.headline !== undefined) linkData.name = input.headline;
  if (input.description !== undefined) linkData.description = input.description;
  if (input.callToActionType !== undefined) {
    linkData.call_to_action = { type: input.callToActionType, value: { link: input.link } };
  }
  return { page_id: input.pageId, link_data: linkData };
}

export async function attachCreativeLogic(
  input: AttachCreativeInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<AttachCreativeOutput> {
  // Effect-class write: the created ad is not snapshotted here. The capability
  // is `create` with a null entity kind on every response.
  const dispatchedCapability: DispatchedCapability = {
    operation: "create",
    canonicalEntityKind: null,
  };

  if (input.dry_run === true) {
    return {
      adSetId: input.adSetId,
      status: "PAUSED",
      attachedAt: new Date().toISOString(),
      dryRun: buildAttachEffectDryRun(input),
      dispatchedCapability,
    };
  }

  const { metaService } = resolveSessionServices(sdkContext);

  // One POST /act_{id}/ads with the creative inline, so the attach is a single
  // upstream write: no orphaned AdCreative when the ad is refused. Draws one
  // write from the account's limiter bucket (MetaService.createEntity).
  const result = (await metaService.createEntity(
    "ad",
    input.adAccountId,
    {
      name: input.name,
      adset_id: input.adSetId,
      status: "PAUSED",
      creative: { name: input.name, object_story_spec: buildObjectStorySpec(input) },
    },
    context
  )) as { id?: unknown };

  const adId = typeof result?.id === "string" && result.id.length > 0 ? result.id : undefined;
  if (!adId) {
    throw new McpError(
      JsonRpcErrorCode.InternalError,
      "Meta ad create returned no ad id; the attach result is unknown. Check the ad set before retrying."
    );
  }

  const effect: EffectResult = {
    effectKind: EFFECT_KIND,
    summary: {
      parent_kind: "ad_set",
      parent_id: input.adSetId,
      asset_type: assetType(input),
      asset_handle: assetHandle(input),
      created_kind: "ad",
      created_id: adId,
      status: "PAUSED",
    },
  };

  return {
    adId,
    adSetId: input.adSetId,
    status: "PAUSED",
    attachedAt: new Date().toISOString(),
    effect,
    dispatchedCapability,
  };
}

/**
 * Symbolic effect dry-run. Checks what Zod cannot (numeric node ids, an http(s)
 * link and thumbnail, the call-to-action shape) and projects the would-be
 * effect. Meta's `execution_options: ["validate_only"]` exists, but an
 * effect-class dry run is symbolic by contract (`EffectDryRunResult` admits no
 * native source), so nothing is sent. Pure (no I/O).
 */
function buildAttachEffectDryRun(input: AttachCreativeInput): EffectDryRunResult {
  const validationErrors: DryRunValidationError[] = [];
  if (!NUMERIC_ID.test(input.adSetId)) {
    validationErrors.push({
      code: "INVALID_AD_SET_ID",
      message: `adSetId must be a numeric Meta id — got "${input.adSetId}"`,
      field: "adSetId",
    });
  }
  if (!NUMERIC_ID.test(input.pageId)) {
    validationErrors.push({
      code: "INVALID_PAGE_ID",
      message: `pageId must be a numeric Facebook Page id — got "${input.pageId}"`,
      field: "pageId",
    });
  }
  for (const field of ["link", "thumbnailUrl"] as const) {
    const value = input[field];
    if (value !== undefined && !isHttpUrl(value)) {
      validationErrors.push({
        code: "INVALID_URL",
        message: `${field} must be an http(s) URL`,
        field,
      });
    }
  }
  if (input.callToActionType !== undefined && !CALL_TO_ACTION_TYPE.test(input.callToActionType)) {
    validationErrors.push({
      code: "INVALID_CALL_TO_ACTION_TYPE",
      message: `callToActionType must be an upper-case Meta call-to-action type such as LEARN_MORE — got "${input.callToActionType}"`,
      field: "callToActionType",
    });
  }

  const expectedEffect: EffectResult = {
    effectKind: EFFECT_KIND,
    summary: {
      parent_kind: "ad_set",
      parent_id: input.adSetId,
      asset_type: assetType(input),
      asset_handle: assetHandle(input),
      created_kind: "ad",
      status: "PAUSED",
    },
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

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

export function attachCreativeResponseFormatter(result: AttachCreativeOutput): McpTextContent[] {
  if (result.dryRun) {
    const { wouldSucceed, validationErrors, validationSource, expectedEffectSource } =
      result.dryRun;
    const verdict = wouldSucceed ? "would succeed" : "would FAIL";
    const errs = validationErrors.map((e) => `  - [${e.code}] ${e.message}`).join("\n");
    return [
      {
        type: "text" as const,
        text:
          `Dry run: attaching the media to ad set ${result.adSetId} ${verdict} (validation: ${validationSource}, expected-effect: ${expectedEffectSource}). No ad was created.` +
          (errs ? `\n${errs}` : "") +
          `\n\nTimestamp: ${result.attachedAt}`,
      },
    ];
  }
  return [
    {
      type: "text" as const,
      text: `Ad created in ad set ${result.adSetId} with status PAUSED.\n\nAd ID: ${result.adId}\n\nActivate it with meta_update_entity (status ACTIVE) when it should start delivering.`,
    },
  ];
}

export const attachCreativeTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: AttachCreativeInputSchema,
  outputSchema: AttachCreativeOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: true,
    idempotentHint: false,
    destructiveHint: false,
    cesteral: {
      kind: "write",
      writeClass: "effect",
      executableArgsExclude: EXECUTABLE_ARGS_EXCLUDE,
      platform: "meta_ads",
      contractPlatformSlug: "meta",
      contractToolSlug: "attach_creative",
      operation: ["create"],
      // Effect-class: the created ad is not snapshotted by this tool, so it
      // names no canonical kind. The parent it attaches to is `adSetId`.
      entityKinds: [],
      entityIdArgs: ["adSetId"],
      schemaVersion: 1,
      contractId: "meta.attach_creative.v1",
      // `dry_run` = symbolic validate + symbolic effect projection (honest true).
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Attach an uploaded image as a link ad",
      input: {
        adAccountId: "act_1234567890",
        adSetId: "120200000000002",
        name: "Summer Sale – banner",
        pageId: "104000000000001",
        imageHash: "8f3a1c2b9d4e5f60718293a4b5c6d7e8",
        link: "https://example.com/summer-sale",
        message: "Summer sale: 30% off everything this week.",
        headline: "Summer Sale",
        callToActionType: "SHOP_NOW",
      },
    },
    {
      label: "Attach an uploaded video with a thumbnail",
      input: {
        adAccountId: "act_1234567890",
        adSetId: "120200000000002",
        name: "Summer Sale – video",
        pageId: "104000000000001",
        videoId: "1203000000000005",
        thumbnailImageHash: "8f3a1c2b9d4e5f60718293a4b5c6d7e8",
        link: "https://example.com/summer-sale",
        headline: "Summer Sale",
      },
    },
  ],
  logic: attachCreativeLogic,
  responseFormatter: attachCreativeResponseFormatter,
  // The response carries ids only; caller-supplied copy is not echoed.
  untrustedContent: NO_UNTRUSTED_CONTENT,
};

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

const TOOL_NAME = "dv360_attach_creative";
const TOOL_TITLE = "Attach Uploaded Media to a DV360 Line Item";
const TOOL_DESCRIPTION = `Attach media already uploaded with dv360_upload_image or dv360_upload_video to a line item: create a hosted creative from the uploaded asset, then add it to the line item's creativeIds.

Give the \`assetId\` the upload returned, \`mediaType\` ("image" or "video"), \`landingPageUrl\` (the creative's default exit) and, for an image, \`widthPixels\`/\`heightPixels\`.

The new creative is created with ENTITY_STATUS_PAUSED, so it does not serve until it is activated with dv360_update_entity (and DV360 has approved it). The line item's own status is not changed.

If the creative is created but the line-item update fails, the error carries the new creativeId: retry with \`existingCreativeId\` instead of \`assetId\`, so no second creative is created. A creative already on the line item is not added twice.`;

/** `dry_run` is the only argument outside the write's identity. */
const EXECUTABLE_ARGS_EXCLUDE = ["dry_run"];

const EFFECT_KIND = "creative_attached";

/** DV360 ids are int64, sent as decimal strings. */
const NUMERIC_ID = /^\d+$/;

export const AttachCreativeInputSchema = z
  .object({
    advertiserId: z.string().min(1).describe("DV360 Advertiser ID that owns the line item"),
    lineItemId: z.string().min(1).describe("ID of the line item the creative is attached to"),
    displayName: z
      .string()
      .min(1)
      .max(240)
      .describe("Display name of the new creative (UTF-8, at most 240 bytes)"),
    mediaType: z
      .enum(["image", "video"])
      .describe(
        "What the uploaded asset is: an image (CREATIVE_TYPE_STANDARD) or a video (CREATIVE_TYPE_VIDEO)"
      ),
    assetId: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Media ID returned by dv360_upload_image / dv360_upload_video. Give exactly one of `assetId` or `existingCreativeId`."
      ),
    existingCreativeId: z
      .string()
      .min(1)
      .optional()
      .describe(
        "ID of a creative an earlier attach already created (its line-item update failed). Skips the creative create and only adds it to the line item. Give exactly one of `assetId` or `existingCreativeId`."
      ),
    landingPageUrl: z.url().describe("Click-through URL of the creative's default exit event"),
    widthPixels: z
      .number()
      .int()
      .optional()
      .describe("Image only (required for an image): width of the creative in pixels"),
    heightPixels: z
      .number()
      .int()
      .optional()
      .describe("Image only (required for an image): height of the creative in pixels"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the request and returns an EffectDryRunResult under `dryRun` (expected effect = the would-be attach) without calling DV360. Nothing is created or changed."
      ),
  })
  .superRefine((value, ctx) => {
    if ((value.assetId === undefined) === (value.existingCreativeId === undefined)) {
      ctx.addIssue({
        code: "custom",
        message: "Provide exactly one of `assetId` or `existingCreativeId`",
        path: [value.assetId === undefined ? "assetId" : "existingCreativeId"],
      });
    }
    const hasDimensions = value.widthPixels !== undefined || value.heightPixels !== undefined;
    if (value.mediaType === "video" && hasDimensions) {
      ctx.addIssue({
        code: "custom",
        message: "`widthPixels` and `heightPixels` apply to an image only",
        path: ["widthPixels"],
      });
    }
    if (
      value.mediaType === "image" &&
      value.assetId !== undefined &&
      (value.widthPixels === undefined || value.heightPixels === undefined)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "An image creative needs both `widthPixels` and `heightPixels`",
        path: ["widthPixels"],
      });
    }
  })
  .describe("Parameters for attaching uploaded media to a DV360 line item");

export const AttachCreativeOutputSchema = z
  .object({
    creativeId: z
      .string()
      .optional()
      .describe("ID of the attached creative. Absent on a dry_run (nothing was created)."),
    lineItemId: z.string().describe("The line item the creative was (or would be) attached to"),
    creativeIds: z
      .array(z.string())
      .optional()
      .describe("The line item's creativeIds after the update. Absent on a dry_run."),
    attachedAt: z.string().datetime(),
    dryRun: EffectDryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. Nothing was created or changed."
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

/**
 * The hosted creative built from the uploaded asset (v4 `Creative`): every
 * field Discovery marks Required for create. A video's dimensions are sent
 * empty; DV360 defaults them to 0 for CREATIVE_TYPE_VIDEO.
 */
export function buildCreativeBody(input: AttachCreativeInput): Record<string, unknown> {
  const isVideo = input.mediaType === "video";
  return {
    displayName: input.displayName,
    entityStatus: "ENTITY_STATUS_PAUSED",
    hostingSource: "HOSTING_SOURCE_HOSTED",
    creativeType: isVideo ? "CREATIVE_TYPE_VIDEO" : "CREATIVE_TYPE_STANDARD",
    dimensions: isVideo ? {} : { widthPixels: input.widthPixels, heightPixels: input.heightPixels },
    assets: [{ asset: { mediaId: input.assetId }, role: "ASSET_ROLE_MAIN" }],
    exitEvents: [{ type: "EXIT_EVENT_TYPE_DEFAULT", url: input.landingPageUrl }],
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function attachCreativeLogic(
  input: AttachCreativeInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<AttachCreativeOutput> {
  // Effect-class write: neither the creative nor the line item is snapshotted
  // here. The capability is `create` with a null entity kind on every response.
  const dispatchedCapability: DispatchedCapability = {
    operation: "create",
    canonicalEntityKind: null,
  };

  if (input.dry_run === true) {
    return {
      lineItemId: input.lineItemId,
      attachedAt: new Date().toISOString(),
      dryRun: buildAttachEffectDryRun(input),
      dispatchedCapability,
    };
  }

  const { dv360Service } = resolveSessionServices(sdkContext);
  const lineItemIds = { advertiserId: input.advertiserId, lineItemId: input.lineItemId };

  // Read the line item first, so a missing or foreign line item fails before
  // any creative exists (no orphan). The same read is the PATCH's merge base.
  const lineItem = (await dv360Service.getEntity("lineItem", lineItemIds, context)) as Record<
    string,
    unknown
  >;

  const reused = input.existingCreativeId !== undefined;
  let creativeId: string;
  if (reused) {
    creativeId = input.existingCreativeId as string;
  } else {
    const created = (await dv360Service.createEntity(
      "creative",
      { advertiserId: input.advertiserId },
      buildCreativeBody(input),
      context
    )) as { creativeId?: unknown };
    if (typeof created?.creativeId !== "string" || created.creativeId.length === 0) {
      throw new McpError(
        JsonRpcErrorCode.InternalError,
        "DV360 creative create returned no creativeId; the attach result is unknown. Check the advertiser's creatives before retrying."
      );
    }
    creativeId = created.creativeId;
  }

  const current = Array.isArray(lineItem.creativeIds)
    ? (lineItem.creativeIds as unknown[]).filter((id): id is string => typeof id === "string")
    : [];

  let creativeIds = current;
  if (!current.includes(creativeId)) {
    try {
      const updated = (await dv360Service.updateEntity(
        "lineItem",
        lineItemIds,
        { creativeIds: [...current, creativeId] },
        "creativeIds",
        context,
        lineItem
      )) as { creativeIds?: unknown };
      creativeIds = Array.isArray(updated?.creativeIds)
        ? (updated.creativeIds as unknown[]).filter((id): id is string => typeof id === "string")
        : [...current, creativeId];
    } catch (error) {
      const code = error instanceof McpError ? error.code : JsonRpcErrorCode.InternalError;
      throw new McpError(
        code,
        `Creative ${creativeId} ${reused ? "was given" : "was created"} but adding it to line item ${input.lineItemId} failed: ${errorMessage(error)}. Retry with existingCreativeId "${creativeId}" (and no assetId) so no second creative is created.`,
        { creativeId, lineItemId: input.lineItemId, creativeCreated: !reused }
      );
    }
  }

  const effect: EffectResult = {
    effectKind: EFFECT_KIND,
    summary: {
      parent_kind: "line_item",
      parent_id: input.lineItemId,
      asset_type: input.mediaType,
      asset_handle: input.assetId ?? null,
      created_kind: "creative",
      created_id: creativeId,
      creative_reused: reused,
    },
  };

  return {
    creativeId,
    lineItemId: input.lineItemId,
    creativeIds,
    attachedAt: new Date().toISOString(),
    effect,
    dispatchedCapability,
  };
}

/**
 * Symbolic effect dry-run: checks what Zod cannot (numeric ids, an http(s)
 * landing URL, positive dimensions) and projects the would-be effect. DV360
 * has no validate-only mode for creatives.create or lineItems.patch, and an
 * effect dry run is symbolic by contract, so nothing is sent. Pure (no I/O).
 */
function buildAttachEffectDryRun(input: AttachCreativeInput): EffectDryRunResult {
  const validationErrors: DryRunValidationError[] = [];
  for (const field of ["advertiserId", "lineItemId", "assetId", "existingCreativeId"] as const) {
    const value = input[field];
    if (value !== undefined && !NUMERIC_ID.test(value)) {
      validationErrors.push({
        code: "INVALID_ID",
        message: `${field} must be a numeric DV360 id — got "${value}"`,
        field,
      });
    }
  }
  if (!isHttpUrl(input.landingPageUrl)) {
    validationErrors.push({
      code: "INVALID_URL",
      message: "landingPageUrl must be an http(s) URL",
      field: "landingPageUrl",
    });
  }
  for (const field of ["widthPixels", "heightPixels"] as const) {
    const value = input[field];
    if (value !== undefined && value <= 0) {
      validationErrors.push({
        code: "INVALID_DIMENSION",
        message: `${field} must be a positive number of pixels — got ${value}`,
        field,
      });
    }
  }

  const expectedEffect: EffectResult = {
    effectKind: EFFECT_KIND,
    summary: {
      parent_kind: "line_item",
      parent_id: input.lineItemId,
      asset_type: input.mediaType,
      asset_handle: input.assetId ?? null,
      created_kind: "creative",
      creative_reused: input.existingCreativeId !== undefined,
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
          `Dry run: attaching the creative to line item ${result.lineItemId} ${verdict} (validation: ${validationSource}, expected-effect: ${expectedEffectSource}). Nothing was created or changed.` +
          (errs ? `\n${errs}` : "") +
          `\n\nTimestamp: ${result.attachedAt}`,
      },
    ];
  }
  return [
    {
      type: "text" as const,
      text: `Creative ${result.creativeId} is on line item ${result.lineItemId}.\n\nLine item creativeIds: ${(result.creativeIds ?? []).join(", ")}\n\nA creative this tool created is PAUSED: activate it with dv360_update_entity (entityStatus ENTITY_STATUS_ACTIVE) when it should serve.`,
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
      platform: "dv360",
      contractPlatformSlug: "dv360",
      contractToolSlug: "attach_creative",
      operation: ["create"],
      // Effect-class: neither the creative nor the line item is snapshotted by
      // this tool, so it names no canonical kind. The parent is `lineItemId`.
      entityKinds: [],
      entityIdArgs: ["lineItemId"],
      schemaVersion: 1,
      contractId: "dv360.attach_creative.v1",
      // `dry_run` = symbolic validate + symbolic effect projection (honest true).
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Attach an uploaded banner image",
      input: {
        advertiserId: "1234567890",
        lineItemId: "9876543210",
        displayName: "Summer Sale 300x250",
        mediaType: "image",
        assetId: "555000111",
        landingPageUrl: "https://example.com/summer-sale",
        widthPixels: 300,
        heightPixels: 250,
      },
    },
    {
      label: "Retry with the creative an earlier attach created",
      input: {
        advertiserId: "1234567890",
        lineItemId: "9876543210",
        displayName: "Summer Sale 300x250",
        mediaType: "image",
        existingCreativeId: "700000123",
        landingPageUrl: "https://example.com/summer-sale",
      },
    },
  ],
  logic: attachCreativeLogic,
  responseFormatter: attachCreativeResponseFormatter,
  // The response carries ids only; caller-supplied text is not echoed.
  untrustedContent: NO_UNTRUSTED_CONTENT,
};

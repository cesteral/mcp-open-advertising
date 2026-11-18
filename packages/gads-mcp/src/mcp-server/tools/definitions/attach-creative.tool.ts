// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { CustomerIdSchema } from "../utils/customer-id.js";
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

const TOOL_NAME = "gads_attach_creative";
const TOOL_TITLE = "Attach an Uploaded Image to a Google Ads Ad Group";
const TOOL_DESCRIPTION = `Attach an image asset already uploaded with gads_upload_image to an ad group, by creating one PAUSED image ad that references the asset.

Give the asset's \`imageAssetResourceName\` (customers/{customerId}/assets/{assetId}, as gads_upload_image returned it), the ad's \`name\` and its \`finalUrl\`. Only ad groups that serve image ads (Display campaigns) accept it; Google Ads refuses the ad otherwise.

The ad is always created with status PAUSED, so nothing starts spending; activate it with gads_update_entity. Returns the new ad's resource name and id.`;

/** `dry_run` is the only argument outside the write's identity. */
const EXECUTABLE_ARGS_EXCLUDE = ["dry_run"];

const EFFECT_KIND = "creative_attached";

const NUMERIC_ID = /^\d+$/;
const ASSET_RESOURCE_NAME = /^customers\/(\d+)\/assets\/(\d+)$/;
/** `customers/{customerId}/adGroupAds/{adGroupId}~{adId}` (entity-mapping `ad`). */
const AD_GROUP_AD_RESOURCE_NAME = /^customers\/\d+\/adGroupAds\/\d+~(\d+)$/;

export const AttachCreativeInputSchema = z
  .object({
    customerId: CustomerIdSchema,
    adGroupId: z.string().min(1).describe("ID of the ad group the new image ad is created in"),
    name: z.string().min(1).describe("Name of the new ad (identifies it; not shown to people)"),
    imageAssetResourceName: z
      .string()
      .min(1)
      .describe(
        "Resource name of the image asset gads_upload_image returned: customers/{customerId}/assets/{assetId}"
      ),
    finalUrl: z.url().describe("Destination URL people reach from the ad"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the request and returns an EffectDryRunResult under `dryRun` (expected effect = the would-be attach) without calling Google Ads. No ad is created."
      ),
  })
  .describe("Parameters for attaching an uploaded image to a Google Ads ad group");

export const AttachCreativeOutputSchema = z
  .object({
    resourceName: z
      .string()
      .optional()
      .describe(
        "Resource name of the created ad group ad (customers/{id}/adGroupAds/{adGroupId}~{adId}). Absent on a dry_run (nothing was created)."
      ),
    adId: z
      .string()
      .optional()
      .describe("ID of the created ad, taken from resourceName. Absent on a dry_run."),
    adGroupId: z.string().describe("The ad group the ad was (or would be) created in"),
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

/** The `AdGroupAd` create operation: one PAUSED image ad referencing the asset. */
export function buildImageAdGroupAd(input: AttachCreativeInput): Record<string, unknown> {
  return {
    adGroup: `customers/${input.customerId}/adGroups/${input.adGroupId}`,
    status: "PAUSED",
    ad: {
      name: input.name,
      finalUrls: [input.finalUrl],
      imageAd: { imageAsset: { asset: input.imageAssetResourceName } },
    },
  };
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
      adGroupId: input.adGroupId,
      status: "PAUSED",
      attachedAt: new Date().toISOString(),
      dryRun: buildAttachEffectDryRun(input),
      dispatchedCapability,
    };
  }

  const { gadsService } = resolveSessionServices(sdkContext);

  // One `adGroupAds:mutate` create, so the attach is a single upstream write.
  // Goes through GAdsService.createEntity for the limiter, retry and headers.
  const result = (await gadsService.createEntity(
    "ad",
    input.customerId,
    buildImageAdGroupAd(input),
    context
  )) as { results?: Array<{ resourceName?: unknown }> };

  const resourceName = result?.results?.[0]?.resourceName;
  const adId =
    typeof resourceName === "string"
      ? AD_GROUP_AD_RESOURCE_NAME.exec(resourceName)?.[1]
      : undefined;
  if (typeof resourceName !== "string" || adId === undefined) {
    throw new McpError(
      JsonRpcErrorCode.InternalError,
      "Google Ads ad group ad create returned no ad group ad resource name; the attach result is unknown. Check the ad group before retrying."
    );
  }

  const effect: EffectResult = {
    effectKind: EFFECT_KIND,
    summary: {
      parent_kind: "ad_group",
      parent_id: input.adGroupId,
      asset_type: "image",
      asset_handle: input.imageAssetResourceName,
      created_kind: "ad",
      created_id: resourceName,
      status: "PAUSED",
    },
  };

  return {
    resourceName,
    adId,
    adGroupId: input.adGroupId,
    status: "PAUSED",
    attachedAt: new Date().toISOString(),
    effect,
    dispatchedCapability,
  };
}

/**
 * Symbolic effect dry-run. Checks what Zod cannot (a numeric ad group id, an
 * asset resource name of this customer, an http(s) final URL) and projects the
 * would-be effect. `MutateAdGroupAdsRequest.validateOnly` exists, but an
 * effect-class dry run is symbolic by contract (`EffectDryRunResult` admits no
 * native source), so nothing is sent. Pure (no I/O).
 */
function buildAttachEffectDryRun(input: AttachCreativeInput): EffectDryRunResult {
  const validationErrors: DryRunValidationError[] = [];
  if (!NUMERIC_ID.test(input.adGroupId)) {
    validationErrors.push({
      code: "INVALID_AD_GROUP_ID",
      message: `adGroupId must be a numeric Google Ads id — got "${input.adGroupId}"`,
      field: "adGroupId",
    });
  }
  const asset = ASSET_RESOURCE_NAME.exec(input.imageAssetResourceName);
  if (!asset) {
    validationErrors.push({
      code: "INVALID_ASSET_RESOURCE_NAME",
      message: `imageAssetResourceName must be customers/{customerId}/assets/{assetId} — got "${input.imageAssetResourceName}"`,
      field: "imageAssetResourceName",
    });
  } else if (asset[1] !== input.customerId) {
    validationErrors.push({
      code: "ASSET_CUSTOMER_MISMATCH",
      message: `imageAssetResourceName belongs to customer ${asset[1]}, not ${input.customerId}`,
      field: "imageAssetResourceName",
    });
  }
  if (!isHttpUrl(input.finalUrl)) {
    validationErrors.push({
      code: "INVALID_URL",
      message: "finalUrl must be an http(s) URL",
      field: "finalUrl",
    });
  }

  const expectedEffect: EffectResult = {
    effectKind: EFFECT_KIND,
    summary: {
      parent_kind: "ad_group",
      parent_id: input.adGroupId,
      asset_type: "image",
      asset_handle: input.imageAssetResourceName,
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
          `Dry run: attaching the image to ad group ${result.adGroupId} ${verdict} (validation: ${validationSource}, expected-effect: ${expectedEffectSource}). No ad was created.` +
          (errs ? `\n${errs}` : "") +
          `\n\nTimestamp: ${result.attachedAt}`,
      },
    ];
  }
  return [
    {
      type: "text" as const,
      text: `Image ad created in ad group ${result.adGroupId} with status PAUSED.\n\nResource name: ${result.resourceName}\nAd ID: ${result.adId}\n\nActivate it with gads_update_entity (entityType "ad", status ENABLED) when it should start delivering.`,
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
      platform: "google_ads",
      contractPlatformSlug: "google_ads",
      contractToolSlug: "attach_creative",
      operation: ["create"],
      // Effect-class: the created ad is not snapshotted by this tool, so it
      // names no canonical kind. The parent it attaches to is `adGroupId`.
      entityKinds: [],
      entityIdArgs: ["adGroupId"],
      schemaVersion: 1,
      contractId: "google_ads.attach_creative.v1",
      // `dry_run` = symbolic validate + symbolic effect projection (honest true).
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Attach an uploaded image to a Display ad group",
      input: {
        customerId: "1234567890",
        adGroupId: "9876543210",
        name: "Summer Sale – 300x250",
        imageAssetResourceName: "customers/1234567890/assets/5555555555",
        finalUrl: "https://example.com/summer-sale",
      },
    },
  ],
  logic: attachCreativeLogic,
  responseFormatter: attachCreativeResponseFormatter,
  // The response carries resource names and ids only; nothing caller- or
  // platform-authored is echoed.
  untrustedContent: NO_UNTRUSTED_CONTENT,
};

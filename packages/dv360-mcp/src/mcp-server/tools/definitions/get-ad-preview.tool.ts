// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { extractEntityIds } from "../utils/entity-id-extraction.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "dv360_get_ad_preview";
const TOOL_TITLE = "Get DV360 Creative Preview";
const TOOL_DESCRIPTION = `Get the details needed to preview a DV360 creative.

DV360's API exposes **no preview URL** for creatives (the v4 Creative resource has no such
field), so this returns what can be used to render or inspect one instead: the third-party
tag (HTML) for third-party display creatives, the VAST tag URL for third-party video/audio
creatives, plus dimensions, creative type, hosting source and review/approval status.
Use the DV360 UI to see a rendered preview of a DV360-hosted creative.

**Usage:** Use creativeId from dv360_list_entities or dv360_create_entity.`;

export const GetAdPreviewInputSchema = z
  .object({
    advertiserId: z.string().describe("DV360 Advertiser ID"),
    creativeId: z.string().describe("DV360 Creative ID"),
  })
  .describe("Parameters for getting a DV360 ad preview");

export const GetAdPreviewOutputSchema = z
  .object({
    creativeName: z.string().optional().describe("Creative display name"),
    creativeType: z.string().optional().describe("Creative type (e.g., CREATIVE_TYPE_STANDARD)"),
    hostingSource: z
      .string()
      .optional()
      .describe(
        "Where the creative is hosted (e.g., HOSTING_SOURCE_HOSTED, HOSTING_SOURCE_THIRD_PARTY)"
      ),
    dimensions: z
      .object({
        widthPixels: z.number().optional(),
        heightPixels: z.number().optional(),
      })
      .optional(),
    thirdPartyTag: z
      .string()
      .optional()
      .describe("Third-party tag HTML (third-party display creatives only) — renders the creative"),
    vastTagUrl: z
      .string()
      .optional()
      .describe("VAST tag URL (third-party VAST video/audio creatives only)"),
    reviewStatus: z
      .record(z.any())
      .optional()
      .describe("DV360 review status (approvalStatus, policy and exchange review statuses)"),
    previewUrl: z.null().describe("Always null: DV360's API has no preview URL for creatives"),
    creativeId: z.string(),
    advertiserId: z.string(),
  })
  .describe("DV360 creative preview info");

type GetAdPreviewInput = z.infer<typeof GetAdPreviewInputSchema>;
type GetAdPreviewOutput = z.infer<typeof GetAdPreviewOutputSchema>;

/** The subset of the v4 `Creative` resource this tool reads. */
interface DV360CreativeResponse {
  displayName?: string;
  creativeType?: string;
  hostingSource?: string;
  thirdPartyTag?: string;
  vastTagUrl?: string;
  reviewStatus?: Record<string, unknown>;
  dimensions?: {
    widthPixels?: number;
    heightPixels?: number;
  };
}

export async function getAdPreviewLogic(
  input: GetAdPreviewInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetAdPreviewOutput> {
  const { dv360Service } = resolveSessionServices(sdkContext);

  // DV360 getEntity expects entityType + a record of IDs
  const entityIds = extractEntityIds(
    { advertiserId: input.advertiserId, creativeId: input.creativeId },
    "creative"
  );

  const creative = (await dv360Service.getEntity(
    "creative",
    entityIds,
    context
  )) as DV360CreativeResponse;

  return {
    creativeName: creative.displayName,
    creativeType: creative.creativeType,
    hostingSource: creative.hostingSource,
    thirdPartyTag: creative.thirdPartyTag,
    vastTagUrl: creative.vastTagUrl,
    reviewStatus: creative.reviewStatus,
    previewUrl: null,
    dimensions: creative.dimensions
      ? {
          widthPixels: creative.dimensions.widthPixels,
          heightPixels: creative.dimensions.heightPixels,
        }
      : undefined,
    creativeId: input.creativeId,
    advertiserId: input.advertiserId,
  };
}

export function getAdPreviewResponseFormatter(result: GetAdPreviewOutput): McpTextContent[] {
  const lines: string[] = [
    "DV360 Creative Preview",
    "",
    `Creative ID: ${result.creativeId}`,
    `Advertiser ID: ${result.advertiserId}`,
  ];

  if (result.creativeName) lines.push(`Name: ${result.creativeName}`);
  if (result.creativeType) lines.push(`Type: ${result.creativeType}`);
  if (result.dimensions) {
    lines.push(`Dimensions: ${result.dimensions.widthPixels}x${result.dimensions.heightPixels}`);
  }

  if (result.hostingSource) lines.push(`Hosting: ${result.hostingSource}`);
  const approval = (result.reviewStatus as { approvalStatus?: string } | undefined)?.approvalStatus;
  if (approval) lines.push(`Approval: ${approval}`);

  if (result.vastTagUrl) {
    lines.push("", `VAST tag URL: ${result.vastTagUrl}`);
  }
  if (result.thirdPartyTag) {
    lines.push("", "Third-party tag:", result.thirdPartyTag);
  }
  if (!result.vastTagUrl && !result.thirdPartyTag) {
    lines.push(
      "",
      "DV360's API provides no preview URL, and this creative has no third-party tag or VAST URL to render. Preview it in the DV360 UI."
    );
  }

  return [
    {
      type: "text" as const,
      text: lines.join("\n"),
    },
  ];
}

export const getAdPreviewTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: GetAdPreviewInputSchema,
  outputSchema: GetAdPreviewOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    idempotentHint: true,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Preview a DV360 creative",
      input: {
        advertiserId: "1234567890",
        creativeId: "9876543210",
      },
    },
  ],
  logic: getAdPreviewLogic,
  responseFormatter: getAdPreviewResponseFormatter,
};

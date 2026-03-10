import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { extractEntityIds } from "../utils/entity-id-extraction.js";
import type { RequestContext } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "dv360_get_ad_preview";
const TOOL_TITLE = "Get DV360 Creative Preview";
const TOOL_DESCRIPTION = `Get a preview URL for a DV360 creative.

Fetches the creative entity and extracts its previewUrl field.
Returns creative metadata including dimensions and type.

**Usage:** Use creativeId from dv360_list_entities or dv360_create_entity.`;

export const GetAdPreviewInputSchema = z
  .object({
    advertiserId: z.string().describe("DV360 Advertiser ID"),
    creativeId: z.string().describe("DV360 Creative ID"),
  })
  .describe("Parameters for getting a DV360 ad preview");

export const GetAdPreviewOutputSchema = z
  .object({
    previewUrl: z.string().optional().describe("Preview URL for the creative"),
    creativeName: z.string().optional().describe("Creative display name"),
    creativeType: z.string().optional().describe("Creative type (e.g., CREATIVE_TYPE_STANDARD)"),
    dimensions: z
      .object({
        widthPixels: z.number().optional(),
        heightPixels: z.number().optional(),
      })
      .optional(),
    creativeId: z.string(),
    advertiserId: z.string(),
  })
  .describe("DV360 creative preview info");

type GetAdPreviewInput = z.infer<typeof GetAdPreviewInputSchema>;
type GetAdPreviewOutput = z.infer<typeof GetAdPreviewOutputSchema>;

interface DV360CreativeResponse {
  displayName?: string;
  creativeType?: string;
  previewUrl?: string;
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
    previewUrl: creative.previewUrl,
    creativeName: creative.displayName,
    creativeType: creative.creativeType,
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

export function getAdPreviewResponseFormatter(result: GetAdPreviewOutput): unknown[] {
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

  if (result.previewUrl) {
    lines.push("", `Preview URL: ${result.previewUrl}`);
  } else {
    lines.push("", "No preview URL available for this creative.");
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

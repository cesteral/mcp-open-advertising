import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { GAdsEntityType } from "../utils/entity-mapping.js";
import type { RequestContext } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "gads_get_ad_preview";
const TOOL_TITLE = "Get Google Ads Ad Preview";
const TOOL_DESCRIPTION = `Get preview information for a Google Ads ad.

Fetches the ad entity via GAQL and returns its type, resource name, and final URLs.
The resource name can be used with the Google Ads generateAdPreview API for a full HTML render.

**Usage:** Use adId from gads_list_entities with entityType=ad or gads_create_entity.
The adId is the numeric ID, not the resource name.`;

export const GetAdPreviewInputSchema = z
  .object({
    customerId: z
      .string()
      .min(1)
      .describe("Google Ads Customer ID (without dashes, e.g., 1234567890)"),
    adId: z.string().min(1).describe("Google Ads Ad ID"),
  })
  .describe("Parameters for getting a Google Ads ad preview");

export const GetAdPreviewOutputSchema = z
  .object({
    adPreviewHtml: z.string().optional().describe("HTML preview placeholder with ad resource name"),
    previewUrl: z.string().optional().describe("Preview URL if available"),
    adType: z.string().optional().describe("Ad type"),
    finalUrls: z.array(z.string()).optional().describe("Final destination URLs for the ad"),
    adId: z.string(),
    customerId: z.string(),
    resourceName: z.string().optional().describe("Ad resource name for use with generateAdPreview API"),
  })
  .describe("Google Ads ad preview");

type GetAdPreviewInput = z.infer<typeof GetAdPreviewInputSchema>;
type GetAdPreviewOutput = z.infer<typeof GetAdPreviewOutputSchema>;

interface GAdsAdRow {
  ad?: {
    id?: string;
    type?: string;
    finalUrls?: string[];
    resourceName?: string;
  };
}

export async function getAdPreviewLogic(
  input: GetAdPreviewInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetAdPreviewOutput> {
  const { gadsService } = resolveSessionServices(sdkContext);

  // Use getEntity which wraps gaqlSearch with buildGetByIdQuery for the "ad" entity type
  const row = (await gadsService.getEntity(
    "ad" as GAdsEntityType,
    input.customerId,
    input.adId,
    context
  )) as GAdsAdRow;

  const ad = row?.ad;
  const resourceName = ad?.resourceName ?? `customers/${input.customerId}/ads/${input.adId}`;

  return {
    adPreviewHtml: `<!-- Ad resource: ${resourceName} -->\n<p>Use the Google Ads generateAdPreview API with resource name "${resourceName}" for a full HTML preview.</p>`,
    previewUrl: undefined,
    adType: ad?.type,
    finalUrls: ad?.finalUrls,
    adId: input.adId,
    customerId: input.customerId,
    resourceName,
  };
}

export function getAdPreviewResponseFormatter(result: GetAdPreviewOutput): unknown[] {
  const lines: string[] = [
    "Google Ads Ad Preview",
    "",
    `Ad ID: ${result.adId}`,
    `Customer ID: ${result.customerId}`,
  ];

  if (result.adType) lines.push(`Ad Type: ${result.adType}`);
  if (result.resourceName) lines.push(`Resource Name: ${result.resourceName}`);
  if (result.finalUrls && result.finalUrls.length > 0) {
    lines.push(`Final URLs: ${result.finalUrls.join(", ")}`);
  }
  if (result.previewUrl) {
    lines.push("", `Preview URL: ${result.previewUrl}`);
  }
  if (result.adPreviewHtml) {
    lines.push("", result.adPreviewHtml);
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
      label: "Preview a Google Ads ad",
      input: {
        customerId: "1234567890",
        adId: "987654321",
      },
    },
  ],
  logic: getAdPreviewLogic,
  responseFormatter: getAdPreviewResponseFormatter,
};

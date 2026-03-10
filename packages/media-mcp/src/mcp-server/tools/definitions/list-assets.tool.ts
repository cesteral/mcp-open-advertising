import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "media_list_assets";

export const ListAssetsInputSchema = z.object({
  advertiserId: z.string().optional().describe("Filter by advertiser ID"),
  platform: z.string().optional().describe("Filter by target platform"),
  assetType: z.string().optional().describe("Filter by type: image, video, audio, file"),
  limit: z.number().int().min(1).max(100).default(50).describe("Max results (default: 50)"),
  cursor: z.number().int().min(0).default(0).describe("Offset for pagination"),
}).describe("Parameters for listing media assets");

export const ListAssetsOutputSchema = z.object({
  assets: z.array(z.object({
    assetId: z.string(),
    storagePath: z.string().describe("Storage path — use with media_get_asset, media_tag_asset, media_delete_asset"),
    publicUrl: z.string(),
    contentType: z.string(),
    sizeBytes: z.number(),
    uploadedAt: z.string(),
    advertiserId: z.string().optional(),
    platform: z.string().optional(),
    assetType: z.string().optional(),
    filename: z.string().optional(),
    tags: z.record(z.string()).optional(),
  })),
  count: z.number(),
}).describe("List of media assets");

type ListAssetsInput = z.infer<typeof ListAssetsInputSchema>;
type ListAssetsOutput = z.infer<typeof ListAssetsOutputSchema>;

export async function listAssetsLogic(
  input: ListAssetsInput,
  _context: RequestContext,
  sdkContext?: SdkContext
): Promise<ListAssetsOutput> {
  const { mediaService } = resolveSessionServices(sdkContext);
  const assets = await mediaService.listAssets(input);
  return { assets, count: assets.length };
}

export function listAssetsResponseFormatter(result: ListAssetsOutput): unknown[] {
  return [{
    type: "text" as const,
    text: `Found ${result.count} asset(s):\n\n${JSON.stringify(result.assets, null, 2)}`,
  }];
}

export const listAssetsTool = {
  name: TOOL_NAME,
  title: "List Media Assets",
  description: "List media assets in the Cesteral media library with optional filters.",
  inputSchema: ListAssetsInputSchema,
  outputSchema: ListAssetsOutputSchema,
  annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true, destructiveHint: false },
  inputExamples: [
    { label: "List all images", input: { assetType: "image", limit: 20 } },
  ],
  logic: listAssetsLogic,
  responseFormatter: listAssetsResponseFormatter,
};

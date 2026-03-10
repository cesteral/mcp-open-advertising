import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "media_tag_asset";

export const TagAssetInputSchema = z.object({
  assetId: z.string().describe("Asset ID (UUID) returned from media_upload_asset"),
  storagePath: z.string().describe("Storage path returned from media_upload_asset"),
  tags: z.record(z.string()).describe("Key-value tags to add/update on the asset"),
}).describe("Parameters for tagging a media asset");

export const TagAssetOutputSchema = z.object({
  assetId: z.string(),
  tags: z.record(z.string()).describe("All tags now set on the asset (merged result)"),
}).describe("Tag update result");

type TagAssetInput = z.infer<typeof TagAssetInputSchema>;
type TagAssetOutput = z.infer<typeof TagAssetOutputSchema>;

export async function tagAssetLogic(
  input: TagAssetInput,
  _context: RequestContext,
  sdkContext?: SdkContext
): Promise<TagAssetOutput> {
  const { mediaService } = resolveSessionServices(sdkContext);
  const mergedTags = await mediaService.tagAsset(input.assetId, input.storagePath, input.tags);
  return { assetId: input.assetId, tags: mergedTags };
}

export function tagAssetResponseFormatter(result: TagAssetOutput): unknown[] {
  return [{
    type: "text" as const,
    text: `Tags updated for asset ${result.assetId}:\n${JSON.stringify(result.tags, null, 2)}`,
  }];
}

export const tagAssetTool = {
  name: TOOL_NAME,
  title: "Tag Media Asset",
  description: "Add or update metadata tags on a media asset. Tags are persisted in a sidecar file and merged with any existing tags.",
  inputSchema: TagAssetInputSchema,
  outputSchema: TagAssetOutputSchema,
  annotations: { readOnlyHint: false, openWorldHint: false, idempotentHint: true, destructiveHint: false },
  inputExamples: [
    { label: "Tag an asset", input: { assetId: "550e8400-e29b-41d4-a716-446655440000", storagePath: "act_123/image/550e8400-e29b-41d4-a716-446655440000.jpg", tags: { campaign: "Q3-2025", status: "approved" } } },
  ],
  logic: tagAssetLogic,
  responseFormatter: tagAssetResponseFormatter,
};

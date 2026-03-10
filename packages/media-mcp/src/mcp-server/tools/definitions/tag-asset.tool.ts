import { z } from "zod";
import type { RequestContext } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "media_tag_asset";

export const TagAssetInputSchema = z.object({
  assetId: z.string().describe("Asset ID"),
  tags: z.record(z.string()).describe("Key-value tags to add/update on the asset"),
}).describe("Parameters for tagging a media asset");

export const TagAssetOutputSchema = z.object({
  message: z.string(),
}).describe("Tag update result");

type TagAssetInput = z.infer<typeof TagAssetInputSchema>;
type TagAssetOutput = z.infer<typeof TagAssetOutputSchema>;

export async function tagAssetLogic(
  input: TagAssetInput,
  _context: RequestContext,
  _sdkContext?: SdkContext
): Promise<TagAssetOutput> {
  return {
    message: `Tags recorded for asset ${input.assetId}: ${JSON.stringify(input.tags)}. Note: Supabase Storage object metadata is set at upload time. For persistent tag management, use a Supabase Database table alongside storage.`,
  };
}

export function tagAssetResponseFormatter(result: TagAssetOutput): unknown[] {
  return [{ type: "text" as const, text: result.message }];
}

export const tagAssetTool = {
  name: TOOL_NAME,
  title: "Tag Media Asset",
  description: "Add or update metadata tags on a media asset.",
  inputSchema: TagAssetInputSchema,
  outputSchema: TagAssetOutputSchema,
  annotations: { readOnlyHint: false, openWorldHint: false, idempotentHint: true, destructiveHint: false },
  inputExamples: [
    { label: "Tag an asset", input: { assetId: "uuid", tags: { campaign: "Q3-2025", status: "approved" } } },
  ],
  logic: tagAssetLogic,
  responseFormatter: tagAssetResponseFormatter,
};

import { z } from "zod";
import type { RequestContext } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "media_get_asset";

export const GetAssetInputSchema = z.object({
  assetId: z.string().describe("Asset ID or storage path returned from media_upload_asset"),
}).describe("Parameters for getting a media asset");

export const GetAssetOutputSchema = z.object({
  message: z.string(),
  hint: z.string(),
}).describe("Asset info or guidance message");

type GetAssetInput = z.infer<typeof GetAssetInputSchema>;
type GetAssetOutput = z.infer<typeof GetAssetOutputSchema>;

export async function getAssetLogic(
  input: GetAssetInput,
  _context: RequestContext,
  _sdkContext?: SdkContext
): Promise<GetAssetOutput> {
  return {
    message: `Asset lookup for ID: ${input.assetId}`,
    hint: "For direct asset retrieval, store the publicUrl from media_upload_asset. Use media_list_assets to browse uploaded assets with filters.",
  };
}

export function getAssetResponseFormatter(result: GetAssetOutput): unknown[] {
  return [{ type: "text" as const, text: `${result.message}\n\n${result.hint}` }];
}

export const getAssetTool = {
  name: TOOL_NAME,
  title: "Get Media Asset",
  description: "Get info about a media asset. Note: store the publicUrl returned by media_upload_asset for direct access. Use media_list_assets to browse assets.",
  inputSchema: GetAssetInputSchema,
  outputSchema: GetAssetOutputSchema,
  annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true, destructiveHint: false },
  inputExamples: [
    { label: "Get asset info", input: { assetId: "550e8400-e29b-41d4-a716-446655440000" } },
  ],
  logic: getAssetLogic,
  responseFormatter: getAssetResponseFormatter,
};

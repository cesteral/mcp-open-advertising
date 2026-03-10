import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "media_delete_asset";

export const DeleteAssetInputSchema = z.object({
  storagePath: z.string().describe("Storage path of the asset (e.g., 'global/image/uuid.jpg')"),
}).describe("Parameters for deleting a media asset");

export const DeleteAssetOutputSchema = z.object({
  deleted: z.boolean(),
  storagePath: z.string(),
}).describe("Deletion result");

type DeleteAssetInput = z.infer<typeof DeleteAssetInputSchema>;
type DeleteAssetOutput = z.infer<typeof DeleteAssetOutputSchema>;

export async function deleteAssetLogic(
  input: DeleteAssetInput,
  _context: RequestContext,
  sdkContext?: SdkContext
): Promise<DeleteAssetOutput> {
  const { mediaService } = resolveSessionServices(sdkContext);
  await mediaService.deleteAsset(input.storagePath);
  return { deleted: true, storagePath: input.storagePath };
}

export function deleteAssetResponseFormatter(result: DeleteAssetOutput): unknown[] {
  return [{ type: "text" as const, text: `Asset deleted: ${result.storagePath}` }];
}

export const deleteAssetTool = {
  name: TOOL_NAME,
  title: "Delete Media Asset",
  description: "Permanently delete a media asset from Supabase Storage by its storage path.",
  inputSchema: DeleteAssetInputSchema,
  outputSchema: DeleteAssetOutputSchema,
  annotations: { readOnlyHint: false, openWorldHint: false, idempotentHint: false, destructiveHint: true },
  inputExamples: [
    { label: "Delete an image", input: { storagePath: "act_1234567890/image/550e8400-e29b-41d4-a716-446655440000.jpg" } },
  ],
  logic: deleteAssetLogic,
  responseFormatter: deleteAssetResponseFormatter,
};

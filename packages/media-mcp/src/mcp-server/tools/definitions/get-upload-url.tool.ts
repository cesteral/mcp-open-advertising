import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "media_get_upload_url";

export const GetUploadUrlInputSchema = z.object({
  filename: z.string().describe("Filename for the asset being uploaded"),
  contentType: z.string().describe("MIME type (e.g., image/jpeg, video/mp4)"),
  advertiserId: z.string().optional().describe("Advertiser ID to organize under"),
}).describe("Parameters for generating a signed upload URL");

export const GetUploadUrlOutputSchema = z.object({
  signedUrl: z.string().describe("Short-lived signed URL for direct upload"),
  storagePath: z.string().describe("Storage path where the file will land after upload — use with media_get_asset, media_tag_asset, media_delete_asset"),
  expiresAt: z.string().datetime().describe("URL expiry time"),
}).describe("Signed upload URL for direct client upload. Note: files uploaded via this URL will NOT appear in media_list_assets because Supabase Storage metadata is written at upload time by the client. Use media_upload_asset (server-side URL proxy) for full library integration.");

type GetUploadUrlInput = z.infer<typeof GetUploadUrlInputSchema>;
type GetUploadUrlOutput = z.infer<typeof GetUploadUrlOutputSchema>;

export async function getUploadUrlLogic(
  input: GetUploadUrlInput,
  _context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetUploadUrlOutput> {
  const { mediaService } = resolveSessionServices(sdkContext);
  return mediaService.getUploadUrl(input);
}

export function getUploadUrlResponseFormatter(result: GetUploadUrlOutput): unknown[] {
  return [{
    type: "text" as const,
    text: `Signed upload URL generated.\n\nStorage Path: ${result.storagePath}\nURL: ${result.signedUrl}\nExpires: ${result.expiresAt}\n\nPUT the file binary directly to this URL with the correct Content-Type header.\n\n⚠️ Note: this file will NOT appear in media_list_assets. Use media_upload_asset for full library integration.`,
  }];
}

export const getUploadUrlTool = {
  name: TOOL_NAME,
  title: "Get Signed Upload URL",
  description: "Generate a short-lived signed URL for direct binary upload to Supabase Storage. Use for large files to bypass server download. ⚠️ Files uploaded via signed URL will NOT appear in media_list_assets — use media_upload_asset for full library integration.",
  inputSchema: GetUploadUrlInputSchema,
  outputSchema: GetUploadUrlOutputSchema,
  annotations: { readOnlyHint: false, openWorldHint: false, idempotentHint: false, destructiveHint: false },
  inputExamples: [
    { label: "Get URL for video upload", input: { filename: "campaign-video.mp4", contentType: "video/mp4", advertiserId: "act_123" } },
  ],
  logic: getUploadUrlLogic,
  responseFormatter: getUploadUrlResponseFormatter,
};

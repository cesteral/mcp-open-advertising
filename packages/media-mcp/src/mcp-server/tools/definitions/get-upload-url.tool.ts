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
  assetId: z.string().describe("Asset ID assigned to this upload slot"),
  expiresAt: z.string().datetime().describe("URL expiry time"),
}).describe("Signed upload URL for direct client upload");

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
    text: `Signed upload URL generated.\n\nAsset ID: ${result.assetId}\nURL: ${result.signedUrl}\nExpires: ${result.expiresAt}\n\nPUT the file binary directly to this URL with the correct Content-Type header.`,
  }];
}

export const getUploadUrlTool = {
  name: TOOL_NAME,
  title: "Get Signed Upload URL",
  description: "Generate a short-lived signed URL for direct binary upload to Supabase Storage. Use for large files to bypass server download.",
  inputSchema: GetUploadUrlInputSchema,
  outputSchema: GetUploadUrlOutputSchema,
  annotations: { readOnlyHint: false, openWorldHint: false, idempotentHint: false, destructiveHint: false },
  inputExamples: [
    { label: "Get URL for video upload", input: { filename: "campaign-video.mp4", contentType: "video/mp4", advertiserId: "act_123" } },
  ],
  logic: getUploadUrlLogic,
  responseFormatter: getUploadUrlResponseFormatter,
};

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { downloadFileToBuffer } from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "tiktok_upload_video";
const TOOL_TITLE = "Upload Video to TikTok Ads";
const TOOL_DESCRIPTION = `Upload a video to TikTok Ads Library from a URL.

The server downloads the video and uploads it to TikTok's ad video library.
Polls until binding is complete (up to 10 minutes).

**Video requirements:**
- Formats: MP4, MOV, AVI (H.264/H.265 codec recommended)
- Max file size: 500MB
- Min resolution: 540x960px (9:16), 960x540px (16:9), or 640x640px (1:1)
- Duration: 5 to 60 seconds for In-Feed ads

**Usage:** The returned videoId is used in ad creative payloads.`;

export const UploadVideoInputSchema = z.object({
  advertiserId: z.string().describe("TikTok Advertiser ID"),
  mediaUrl: z.string().url().describe("Publicly accessible URL of the video to upload"),
  videoName: z.string().optional().describe("Optional name for the video in the library"),
}).describe("Parameters for uploading a video to TikTok");

export const UploadVideoOutputSchema = z.object({
  videoId: z.string().describe("Video ID for use in ad creative payloads"),
  videoName: z.string().optional(),
  duration: z.number().optional().describe("Video duration in seconds"),
  uploadedAt: z.string().datetime(),
}).describe("Uploaded TikTok video info");

type UploadVideoInput = z.infer<typeof UploadVideoInputSchema>;
type UploadVideoOutput = z.infer<typeof UploadVideoOutputSchema>;

interface TikTokVideoUploadResponse {
  video_id?: string;
  video_name?: string;
}

interface TikTokVideoInfoItem {
  video_id: string;
  video_name?: string;
  duration?: number;
  video_status?: string;
}

interface TikTokVideoInfoResponse {
  list?: TikTokVideoInfoItem[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function uploadVideoLogic(
  input: UploadVideoInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<UploadVideoOutput> {
  const { tiktokService } = resolveSessionServices(sdkContext);

  const { buffer, contentType, filename } = await downloadFileToBuffer(
    input.mediaUrl,
    600_000, // 10 min for large videos
    context
  );

  const fields: Record<string, string> = {};
  if (input.videoName) fields.video_name = input.videoName;

  const uploadResult = await tiktokService.client.postMultipart(
    "/open_api/v1.3/file/video/ad/upload/",
    fields,
    "video_file",
    buffer,
    filename,
    contentType,
    context
  ) as TikTokVideoUploadResponse;

  const videoId = uploadResult.video_id;
  if (!videoId) {
    throw new Error("TikTok video upload failed: no video_id returned");
  }

  // Poll for bind_success status (max 10 min, 20s intervals)
  const maxAttempts = 30;
  const pollIntervalMs = 20_000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await sleep(pollIntervalMs);

    const statusResult = await tiktokService.client.post(
      "/open_api/v1.3/file/video/ad/info/",
      { video_ids: [videoId] },
      context
    ) as TikTokVideoInfoResponse;

    const videoInfo = statusResult.list?.[0];
    const videoStatus = videoInfo?.video_status ?? "processing";

    if (videoStatus === "bind_success") {
      return {
        videoId,
        videoName: videoInfo?.video_name ?? input.videoName,
        duration: videoInfo?.duration,
        uploadedAt: new Date().toISOString(),
      };
    }

    if (videoStatus === "error" || videoStatus === "deleted") {
      throw new Error(`TikTok video processing failed: status=${videoStatus}`);
    }
  }

  return {
    videoId,
    videoName: uploadResult.video_name ?? input.videoName,
    uploadedAt: new Date().toISOString(),
  };
}

export function uploadVideoResponseFormatter(result: UploadVideoOutput): McpTextContent[] {
  return [{
    type: "text" as const,
    text: `Video uploaded to TikTok!\n\nVideo ID: ${result.videoId}${result.videoName ? `\nName: ${result.videoName}` : ""}${result.duration !== undefined ? `\nDuration: ${result.duration}s` : ""}\n\nUse videoId in your ad creative payload`,
  }];
}

export const uploadVideoTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: UploadVideoInputSchema,
  outputSchema: UploadVideoOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: true,
    idempotentHint: false,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Upload a TikTok campaign video",
      input: {
        advertiserId: "1234567890",
        mediaUrl: "https://example.com/video.mp4",
        videoName: "Summer Campaign 2025",
      },
    },
  ],
  logic: uploadVideoLogic,
  responseFormatter: uploadVideoResponseFormatter,
};

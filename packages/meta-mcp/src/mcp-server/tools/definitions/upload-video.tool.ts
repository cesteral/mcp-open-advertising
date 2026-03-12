import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { downloadFileToBuffer } from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "meta_upload_video";
const TOOL_TITLE = "Upload Video to Meta Ads";
const TOOL_DESCRIPTION = `Upload a video to Meta Ads Library from a URL.

The server downloads the video and uploads it to Meta's ad video library.
Polls until processing is complete (up to 5 minutes).

**Video requirements:**
- Formats: MP4, MOV (H.264 codec recommended)
- Max file size: 4GB
- Min resolution: 120x120px
- Recommended: 1080x1080px (square) or 1920x1080px (landscape)
- Duration: 1 second to 240 minutes

**Usage:** The returned videoId is used in adCreative → video_data → video_id`;

export const UploadVideoInputSchema = z.object({
  adAccountId: z.string().describe("Meta Ad Account ID (e.g., act_1234567890)"),
  mediaUrl: z.string().url().describe("Publicly accessible URL of the video to upload"),
  title: z.string().optional().describe("Optional video title"),
  description: z.string().optional().describe("Optional video description"),
}).describe("Parameters for uploading a video to Meta");

export const UploadVideoOutputSchema = z.object({
  videoId: z.string().describe("Video ID used in ad creative payloads"),
  title: z.string().optional(),
  status: z.string().describe("Processing status"),
  uploadedAt: z.string().datetime(),
}).describe("Uploaded video info");

type UploadVideoInput = z.infer<typeof UploadVideoInputSchema>;
type UploadVideoOutput = z.infer<typeof UploadVideoOutputSchema>;

interface MetaVideoUploadResponse {
  id: string;
  title?: string;
}

interface MetaVideoStatusResponse {
  status?: {
    processing_progress?: number;
    video_status?: string;
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function uploadVideoLogic(
  input: UploadVideoInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<UploadVideoOutput> {
  const { metaService } = resolveSessionServices(sdkContext);

  const { buffer, contentType, filename } = await downloadFileToBuffer(
    input.mediaUrl,
    300_000, // 5 min for large videos
    context
  );

  const fields: Record<string, string> = {};
  if (input.title) fields.title = input.title;
  if (input.description) fields.description = input.description;

  const uploadResult = await metaService.graphApiClient.postMultipart(
    `/${input.adAccountId}/advideos`,
    fields,
    "source",
    buffer,
    filename,
    contentType,
    context
  ) as MetaVideoUploadResponse;

  const videoId = uploadResult.id;
  if (!videoId) {
    throw new Error("Meta video upload failed: no video ID returned");
  }

  // Poll for processing completion (max 5 min, 15s intervals)
  const maxAttempts = 20;
  const pollIntervalMs = 15_000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await sleep(pollIntervalMs);

    const statusResult = await metaService.graphApiClient.get(
      `/${videoId}`,
      { fields: "status" },
      context
    ) as MetaVideoStatusResponse;

    const progress = statusResult.status?.processing_progress ?? 0;
    const videoStatus = statusResult.status?.video_status ?? "processing";

    if (progress >= 100 || videoStatus === "ready") {
      return {
        videoId,
        title: input.title ?? uploadResult.title,
        status: "ready",
        uploadedAt: new Date().toISOString(),
      };
    }

    if (videoStatus === "error") {
      throw new Error(`Meta video processing failed: status=${videoStatus}`);
    }
  }

  // Return with processing status if poll timed out
  return {
    videoId,
    title: input.title ?? uploadResult.title,
    status: "processing",
    uploadedAt: new Date().toISOString(),
  };
}

export function uploadVideoResponseFormatter(result: UploadVideoOutput): McpTextContent[] {
  return [{
    type: "text" as const,
    text: `Video uploaded to Meta!\n\nVideo ID: ${result.videoId}\nStatus: ${result.status}${result.title ? `\nTitle: ${result.title}` : ""}\n\nUse videoId in adCreative.video_data.video_id`,
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
      label: "Upload a campaign video",
      input: {
        adAccountId: "act_1234567890",
        mediaUrl: "https://example.com/summer-sale.mp4",
        title: "Summer Sale 2025",
      },
    },
  ],
  logic: uploadVideoLogic,
  responseFormatter: uploadVideoResponseFormatter,
};

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  // Distinct values per media type, so the test below can tell which pair the
  // image tool reads.
  process.env.SNAPCHAT_IMAGE_UPLOAD_POLL_INTERVAL_MS = "7";
  process.env.SNAPCHAT_IMAGE_UPLOAD_MAX_POLL_ATTEMPTS = "4";
  process.env.SNAPCHAT_VIDEO_UPLOAD_POLL_INTERVAL_MS = "11";
  process.env.SNAPCHAT_VIDEO_UPLOAD_MAX_POLL_ATTEMPTS = "5";
});

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: vi.fn(),
}));

vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return {
    ...actual,
    downloadFileToBuffer: vi.fn(),
    pollUntilComplete: vi.fn(),
  };
});

import {
  JsonRpcErrorCode,
  ReportTimeoutError,
  downloadFileToBuffer,
  pollUntilComplete,
} from "@cesteral/shared";
import { resolveSessionServices } from "../../src/mcp-server/tools/utils/resolve-session.js";
import { uploadImageLogic } from "../../src/mcp-server/tools/definitions/upload-image.tool.js";
import { uploadVideoLogic } from "../../src/mcp-server/tools/definitions/upload-video.tool.js";
import { parseConfig } from "../../src/config/index.js";

const mockDownloadFileToBuffer = vi.mocked(downloadFileToBuffer);
const mockPollUntilComplete = vi.mocked(pollUntilComplete);
const mockResolveSessionServices = vi.mocked(resolveSessionServices);

describe("snapchat_upload_image", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDownloadFileToBuffer.mockResolvedValue({
      buffer: Buffer.from("image"),
      contentType: "image/png",
      filename: "creative.png",
    });
  });

  it("throws a timeout error when media never reaches READY", async () => {
    const snapchatService = {
      createMedia: vi.fn().mockResolvedValue({
        media: [{ media: { id: "media_123" } }],
      }),
      uploadMediaFile: vi.fn().mockResolvedValue(undefined),
      getMedia: vi.fn(),
    };
    mockResolveSessionServices.mockReturnValue({
      boundAdAccountId: "acct_123",
      snapchatService,
    } as any);
    mockPollUntilComplete.mockRejectedValue(new ReportTimeoutError(3));

    await expect(
      uploadImageLogic(
        {
          adAccountId: "acct_123",
          mediaUrl: "https://example.com/creative.png",
          name: "Creative",
        },
        { requestId: "req-1", timestamp: new Date().toISOString(), operation: "test" },
        { sessionId: "session-1" }
      )
    ).rejects.toMatchObject({
      code: JsonRpcErrorCode.Timeout,
      data: expect.objectContaining({ mediaId: "media_123" }),
    });
  });

  // STATUS snapchat #21: images used to poll at the video interval and budget.
  describe("status polling uses the per-media-type settings", () => {
    const run = (logic: typeof uploadImageLogic | typeof uploadVideoLogic) => {
      mockResolveSessionServices.mockReturnValue({
        boundAdAccountId: "acct_123",
        snapchatService: {
          createMedia: vi.fn().mockResolvedValue({ media: [{ media: { id: "media_123" } }] }),
          uploadMediaFile: vi.fn().mockResolvedValue(undefined),
          getMedia: vi.fn(),
        },
      } as any);
      mockPollUntilComplete.mockResolvedValue("READY");
      return logic(
        { adAccountId: "acct_123", mediaUrl: "https://example.com/creative.png" } as any,
        { requestId: "req-1", timestamp: new Date().toISOString(), operation: "test" },
        { sessionId: "session-1" }
      );
    };

    it("snapchat_upload_image polls at SNAPCHAT_IMAGE_UPLOAD_* settings", async () => {
      await run(uploadImageLogic);
      expect(mockPollUntilComplete).toHaveBeenCalledOnce();
      expect(mockPollUntilComplete.mock.calls[0]![0]).toMatchObject({
        initialDelayMs: 7,
        maxDelayMs: 7,
        maxAttempts: 4,
        backoffFactor: 1,
      });
    });

    it("snapchat_upload_video still polls at SNAPCHAT_VIDEO_UPLOAD_* settings", async () => {
      await run(uploadVideoLogic);
      expect(mockPollUntilComplete.mock.calls[0]![0]).toMatchObject({
        initialDelayMs: 11,
        maxDelayMs: 11,
        maxAttempts: 5,
      });
    });

    it("defaults: images 2 s × 30 attempts, videos unchanged at 20 s × 30", () => {
      const keys = [
        "SNAPCHAT_IMAGE_UPLOAD_POLL_INTERVAL_MS",
        "SNAPCHAT_IMAGE_UPLOAD_MAX_POLL_ATTEMPTS",
        "SNAPCHAT_VIDEO_UPLOAD_POLL_INTERVAL_MS",
        "SNAPCHAT_VIDEO_UPLOAD_MAX_POLL_ATTEMPTS",
      ] as const;
      const saved = keys.map((k) => process.env[k]);
      try {
        for (const k of keys) delete process.env[k];
        expect(parseConfig()).toMatchObject({
          snapchatImageUploadPollIntervalMs: 2_000,
          snapchatImageUploadMaxPollAttempts: 30,
          snapchatVideoUploadPollIntervalMs: 20_000,
          snapchatVideoUploadMaxPollAttempts: 30,
        });
      } finally {
        keys.forEach((k, i) => {
          if (saved[i] === undefined) delete process.env[k];
          else process.env[k] = saved[i];
        });
      }
    });
  });
});

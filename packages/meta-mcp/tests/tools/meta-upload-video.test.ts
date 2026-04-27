import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockResolveSessionServices, mockDownloadFileToBuffer, mockFetchWithTimeout } = vi.hoisted(
  () => ({
    mockResolveSessionServices: vi.fn(),
    mockDownloadFileToBuffer: vi.fn(),
    mockFetchWithTimeout: vi.fn(),
  })
);

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return {
    ...actual,
    downloadFileToBuffer: mockDownloadFileToBuffer,
    fetchWithTimeout: mockFetchWithTimeout,
  };
});

vi.mock("../../src/config/index.js", () => ({
  mcpConfig: {
    metaVideoUploadPollIntervalMs: 1,
    metaVideoUploadMaxPollAttempts: 2,
    metaVideoUploadMaxBufferedBytes: 10,
  },
}));

import { uploadVideoLogic } from "../../src/mcp-server/tools/definitions/upload-video.tool.js";

function createMockContext() {
  return {
    requestId: "req-123",
    timestamp: new Date().toISOString(),
    operation: "test",
  } as any;
}

function createMockSdkContext(sessionId = "session-123") {
  return { sessionId } as any;
}

function createHeadResponse(contentLength?: string) {
  return {
    ok: true,
    headers: {
      get: (name: string) => {
        if (name.toLowerCase() === "content-length") {
          return contentLength ?? null;
        }
        return null;
      },
    },
  } as unknown as Response;
}

describe("uploadVideoLogic", () => {
  let mockGraphApiClient: {
    postMultipart: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockGraphApiClient = {
      postMultipart: vi.fn().mockResolvedValue({ id: "video-123", title: "Uploaded Video" }),
      get: vi
        .fn()
        .mockResolvedValue({ status: { processing_progress: 100, video_status: "ready" } }),
    };

    mockResolveSessionServices.mockReturnValue({
      metaService: {
        graphApiClient: mockGraphApiClient,
      },
    });
  });

  it("rejects oversized uploads before download when HEAD exposes content-length", async () => {
    mockFetchWithTimeout.mockResolvedValue(createHeadResponse("11"));

    await expect(
      uploadVideoLogic(
        {
          adAccountId: "act_123",
          mediaUrl: "https://example.com/video.mp4",
        },
        createMockContext(),
        createMockSdkContext()
      )
    ).rejects.toThrow("exceeding the server's buffered upload limit");

    expect(mockDownloadFileToBuffer).not.toHaveBeenCalled();
    expect(mockGraphApiClient.postMultipart).not.toHaveBeenCalled();
  });

  it("rejects oversized uploads after download when content-length is unavailable", async () => {
    mockFetchWithTimeout.mockResolvedValue(createHeadResponse(undefined));
    mockDownloadFileToBuffer.mockResolvedValue({
      buffer: Buffer.alloc(11),
      contentType: "video/mp4",
      filename: "video.mp4",
    });

    await expect(
      uploadVideoLogic(
        {
          adAccountId: "act_123",
          mediaUrl: "https://example.com/video.mp4",
        },
        createMockContext(),
        createMockSdkContext()
      )
    ).rejects.toThrow("aborted after download");

    expect(mockGraphApiClient.postMultipart).not.toHaveBeenCalled();
  });

  it("uploads and polls successfully for normal-sized files", async () => {
    mockFetchWithTimeout.mockResolvedValue(createHeadResponse("10"));
    mockDownloadFileToBuffer.mockResolvedValue({
      buffer: Buffer.alloc(10),
      contentType: "video/mp4",
      filename: "video.mp4",
    });

    const result = await uploadVideoLogic(
      {
        adAccountId: "123",
        mediaUrl: "https://example.com/video.mp4",
        title: "Launch Video",
      },
      createMockContext(),
      createMockSdkContext()
    );

    expect(result).toMatchObject({
      videoId: "video-123",
      title: "Launch Video",
      status: "ready",
    });
    expect(mockGraphApiClient.postMultipart).toHaveBeenCalledWith(
      "/act_123/advideos",
      { title: "Launch Video" },
      "source",
      expect.any(Buffer),
      "video.mp4",
      "video/mp4",
      expect.anything()
    );
  });
});

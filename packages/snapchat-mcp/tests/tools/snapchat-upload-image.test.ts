import { beforeEach, describe, expect, it, vi } from "vitest";

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
    const client = {
      post: vi.fn().mockResolvedValue({
        media: [{ media: { id: "media_123" } }],
      }),
      postMultipart: vi.fn().mockResolvedValue({}),
      get: vi.fn(),
    };
    mockResolveSessionServices.mockReturnValue({ snapchatService: { client } } as any);
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
});

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockResolveSessionServices, mockDownload } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
  mockDownload: vi.fn(),
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return { ...actual, downloadFileToBuffer: mockDownload };
});

import { JsonRpcErrorCode } from "@cesteral/shared";
import { uploadImageLogic } from "../../src/mcp-server/tools/definitions/upload-image.tool.js";
import { uploadVideoLogic } from "../../src/mcp-server/tools/definitions/upload-video.tool.js";

/**
 * Fleet review linkedin #19: the upload tools registered the asset upstream
 * BEFORE downloading the file, so a failed download or an oversized file left
 * an orphaned registered asset, and the size limit (a client-side input check)
 * surfaced as InternalError. The file is now fetched and size-checked first.
 */
const ctx = { requestId: "r" } as any;
const sdk = { sessionId: "s" } as any;

const cases = [
  {
    label: "linkedin_upload_image",
    logic: uploadImageLogic,
    input: { adAccountUrn: "urn:li:sponsoredAccount:1", mediaUrl: "https://x.com/a.jpg" },
    oversizedBytes: 5 * 1024 * 1024 + 1,
  },
  {
    label: "linkedin_upload_video",
    logic: uploadVideoLogic,
    input: { adAccountUrn: "urn:li:sponsoredAccount:1", mediaUrl: "https://x.com/a.mp4" },
    oversizedBytes: 200 * 1024 * 1024 + 1,
  },
] as const;

describe("linkedin uploads fetch the file before registering the asset", () => {
  let client: { post: ReturnType<typeof vi.fn>; putBinary: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    client = { post: vi.fn(), putBinary: vi.fn() };
    mockResolveSessionServices.mockReturnValue({ linkedInService: { client } });
  });

  for (const c of cases) {
    describe(c.label, () => {
      it("does not register an asset when the download fails", async () => {
        mockDownload.mockRejectedValueOnce(new Error("download failed: 404"));

        await expect(c.logic({ ...c.input } as any, ctx, sdk)).rejects.toThrow("download failed");
        expect(client.post).not.toHaveBeenCalled();
      });

      it("refuses an oversized file as InvalidParams without registering", async () => {
        mockDownload.mockResolvedValueOnce({
          buffer: { length: c.oversizedBytes } as unknown as Buffer,
          contentType: "application/octet-stream",
          filename: "f",
        });

        await expect(c.logic({ ...c.input } as any, ctx, sdk)).rejects.toMatchObject({
          code: JsonRpcErrorCode.InvalidParams,
        });
        expect(client.post).not.toHaveBeenCalled();
        expect(client.putBinary).not.toHaveBeenCalled();
      });
    });
  }
});

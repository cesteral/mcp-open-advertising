import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: vi.fn(),
}));

import { resolveSessionServices } from "../../src/mcp-server/tools/utils/resolve-session.js";
const mockResolve = vi.mocked(resolveSessionServices);

import {
  uploadVideoLogic,
  UploadVideoInputSchema,
} from "../../src/mcp-server/tools/definitions/upload-video.tool.js";

const mockCreateEntity = vi.fn();
const ctx = { requestId: "r" } as any;
const sdk = { sessionId: "s" } as any;

beforeEach(() => {
  vi.clearAllMocks();
  mockResolve.mockReturnValue({ gadsService: { createEntity: mockCreateEntity } } as any);
});

describe("gads_upload_video", () => {
  it("creates a YouTubeVideoAsset referencing the video ID", async () => {
    mockCreateEntity.mockResolvedValue({
      results: [{ resourceName: "customers/1/assets/999" }],
    });

    const result = await uploadVideoLogic(
      { customerId: "1", name: "Launch 15s", youtubeVideoId: "dQw4w9WgXcQ" } as any,
      ctx,
      sdk
    );

    expect(mockCreateEntity).toHaveBeenCalledOnce();
    const [entityType, customerId, data] = mockCreateEntity.mock.calls[0];
    expect(entityType).toBe("asset");
    expect(customerId).toBe("1");
    expect(data.type).toBe("YOUTUBE_VIDEO");
    expect(data.youtubeVideoAsset.youtubeVideoId).toBe("dQw4w9WgXcQ");
    expect(result.resourceName).toBe("customers/1/assets/999");
    expect(result.effect?.effectKind).toBe("asset_uploaded");
    expect(result.effect?.summary.asset_type).toBe("video");
    expect(result.dispatchedCapability).toEqual({ operation: "upload", canonicalEntityKind: null });
  });

  it("dry_run validates the video ID and does not create anything", async () => {
    const result = await uploadVideoLogic(
      { customerId: "1", name: "Launch", youtubeVideoId: "dQw4w9WgXcQ", dry_run: true } as any,
      ctx,
      sdk
    );
    expect(mockCreateEntity).not.toHaveBeenCalled();
    expect(result.dryRun?.wouldSucceed).toBe(true);
    expect(result.resourceName).toBeUndefined();
  });

  it("rejects a full watch URL — only the 11-char ID is accepted", () => {
    const parsed = UploadVideoInputSchema.safeParse({
      customerId: "1",
      name: "x",
      youtubeVideoId: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });
    expect(parsed.success).toBe(false);
  });

  it("requires a numeric customerId", () => {
    expect(
      UploadVideoInputSchema.safeParse({
        customerId: "12-34",
        name: "x",
        youtubeVideoId: "dQw4w9WgXcQ",
      }).success
    ).toBe(false);
  });
});

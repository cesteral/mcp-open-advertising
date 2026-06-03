import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockResolveSessionServices } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return {
    ...actual,
    downloadFileToBuffer: vi
      .fn()
      .mockResolvedValue({ buffer: Buffer.from("x"), contentType: "video/mp4", filename: "f.mp4" }),
    pollUntilComplete: vi.fn().mockResolvedValue("succeeded"),
  };
});

import {
  uploadVideoLogic,
  uploadVideoResponseFormatter,
  UploadVideoOutputSchema,
} from "../../src/mcp-server/tools/definitions/upload-video.tool.js";
import { EffectResultSchema, EffectDryRunResultSchema } from "@cesteral/shared";

const ctx = { requestId: "r" } as any;
const sdk = { sessionId: "s" } as any;

const baseInput = { adAccountId: "1234567890", mediaUrl: "https://x.com/a.mp4" };

describe("pinterest_upload_video governance contract (effect class)", () => {
  let client: {
    post: ReturnType<typeof vi.fn>;
    uploadToS3: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    client = {
      post: vi
        .fn()
        .mockResolvedValue({
          media_id: "media-1",
          upload_url: "https://s3",
          upload_parameters: {},
        }),
      uploadToS3: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue({ media_processing_record: { status: "succeeded" } }),
    };
    mockResolveSessionServices.mockReturnValue({ pinterestService: { client } });
  });

  it("dry_run returns a symbolic effect preview, no download or API call", async () => {
    const result = await uploadVideoLogic({ ...baseInput, dry_run: true } as any, ctx, sdk);
    expect(client.post).not.toHaveBeenCalled();
    expect(result.mediaId).toBeUndefined();
    expect(result.dryRun?.expectedEffect).toEqual({
      effectKind: "asset_uploaded",
      summary: { asset_type: "video" },
    });
    expect(result.dispatchedCapability).toEqual({ operation: "upload", canonicalEntityKind: null });
    expect(() => UploadVideoOutputSchema.parse(result)).not.toThrow();
    expect(() => EffectDryRunResultSchema.parse(result.dryRun)).not.toThrow();
  });

  it("dry_run flags a non-http(s) mediaUrl", async () => {
    const result = await uploadVideoLogic(
      { ...baseInput, mediaUrl: "ftp://x.com/a", dry_run: true } as any,
      ctx,
      sdk
    );
    expect(result.dryRun?.wouldSucceed).toBe(false);
    expect(result.dryRun?.validationErrors[0]?.code).toBe("INVALID_MEDIA_URL");
  });

  it("execute returns the effect identity + null-kind capability", async () => {
    const result = await uploadVideoLogic({ ...baseInput } as any, ctx, sdk);
    expect(client.uploadToS3).toHaveBeenCalledOnce();
    expect(result.mediaId).toBe("media-1");
    expect(result.effect).toEqual({
      effectKind: "asset_uploaded",
      summary: { asset_type: "video", asset_handle: "media-1" },
    });
    expect(result.dispatchedCapability.canonicalEntityKind).toBeNull();
    expect(() => UploadVideoOutputSchema.parse(result)).not.toThrow();
    expect(() => EffectResultSchema.parse(result.effect)).not.toThrow();
  });

  it("formatter renders a dry-run message without a false success", () => {
    const content = uploadVideoResponseFormatter({
      uploadedAt: "2026-06-03T00:00:00.000Z",
      dispatchedCapability: { operation: "upload", canonicalEntityKind: null },
      dryRun: {
        wouldSucceed: true,
        validationErrors: [],
        validationSource: "symbolic",
        expectedEffectSource: "symbolic",
        expectedEffect: { effectKind: "asset_uploaded", summary: { asset_type: "video" } },
      },
    } as any);
    expect(content[0].text).toContain("Dry run: uploading a video would succeed");
    expect(content[0].text).not.toContain("Video uploaded to Pinterest");
  });
});

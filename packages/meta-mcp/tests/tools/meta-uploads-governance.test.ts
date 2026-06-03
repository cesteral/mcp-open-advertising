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
    downloadFileToBuffer: vi.fn().mockResolvedValue({
      buffer: Buffer.from("x"),
      contentType: "image/jpeg",
      filename: "f.jpg",
    }),
    fetchWithTimeout: vi.fn().mockResolvedValue({ ok: true, headers: { get: () => null } }),
    pollUntilComplete: vi.fn().mockResolvedValue({ progress: 100, videoStatus: "ready" }),
  };
});

import {
  uploadImageLogic,
  uploadImageResponseFormatter,
  UploadImageOutputSchema,
} from "../../src/mcp-server/tools/definitions/upload-image.tool.js";
import {
  uploadVideoLogic,
  uploadVideoResponseFormatter,
  UploadVideoOutputSchema,
} from "../../src/mcp-server/tools/definitions/upload-video.tool.js";
import { EffectResultSchema, EffectDryRunResultSchema } from "@cesteral/shared";

const ctx = { requestId: "r" } as any;
const sdk = { sessionId: "s" } as any;

describe("meta uploads governance contract (effect class)", () => {
  let graphApiClient: { postMultipart: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    graphApiClient = {
      postMultipart: vi.fn(),
      get: vi
        .fn()
        .mockResolvedValue({ status: { processing_progress: 100, video_status: "ready" } }),
    };
    mockResolveSessionServices.mockReturnValue({ metaService: { graphApiClient } });
  });

  describe("meta_upload_image", () => {
    it("dry_run returns a symbolic effect preview, no download or API call", async () => {
      const result = await uploadImageLogic(
        { adAccountId: "act_1", mediaUrl: "https://x.com/a.jpg", dry_run: true } as any,
        ctx,
        sdk
      );
      expect(graphApiClient.postMultipart).not.toHaveBeenCalled();
      expect(result.imageHash).toBeUndefined();
      expect(result.dryRun?.expectedEffect).toEqual({
        effectKind: "asset_uploaded",
        summary: { asset_type: "image" },
      });
      expect(result.dispatchedCapability).toEqual({
        operation: "upload",
        canonicalEntityKind: null,
      });
      expect(() => UploadImageOutputSchema.parse(result)).not.toThrow();
      expect(() => EffectDryRunResultSchema.parse(result.dryRun)).not.toThrow();
    });

    it("dry_run flags a non-http(s) mediaUrl", async () => {
      const result = await uploadImageLogic(
        { adAccountId: "act_1", mediaUrl: "ftp://x.com/a.jpg", dry_run: true } as any,
        ctx,
        sdk
      );
      expect(result.dryRun?.wouldSucceed).toBe(false);
      expect(result.dryRun?.validationErrors[0]?.code).toBe("INVALID_MEDIA_URL");
    });

    it("execute returns the effect identity + null-kind capability", async () => {
      graphApiClient.postMultipart.mockResolvedValueOnce({
        images: { f: { hash: "hash-1", url: "https://x.com/p.jpg", name: "f.jpg" } },
      });
      const result = await uploadImageLogic(
        { adAccountId: "act_1", mediaUrl: "https://x.com/a.jpg" } as any,
        ctx,
        sdk
      );
      expect(graphApiClient.postMultipart).toHaveBeenCalledOnce();
      expect(result.imageHash).toBe("hash-1");
      expect(result.effect).toEqual({
        effectKind: "asset_uploaded",
        summary: { asset_type: "image", asset_handle: "hash-1" },
      });
      expect(result.dispatchedCapability.canonicalEntityKind).toBeNull();
      expect(() => UploadImageOutputSchema.parse(result)).not.toThrow();
      expect(() => EffectResultSchema.parse(result.effect)).not.toThrow();
    });

    it("formatter renders a dry-run message without a false success", () => {
      const content = uploadImageResponseFormatter({
        uploadedAt: "2026-06-03T00:00:00.000Z",
        dispatchedCapability: { operation: "upload", canonicalEntityKind: null },
        dryRun: {
          wouldSucceed: true,
          validationErrors: [],
          validationSource: "symbolic",
          expectedEffectSource: "symbolic",
          expectedEffect: { effectKind: "asset_uploaded", summary: { asset_type: "image" } },
        },
      } as any);
      expect(content[0].text).toContain("Dry run: uploading an image would succeed");
      expect(content[0].text).not.toContain("Image uploaded to Meta");
    });
  });

  describe("meta_upload_video", () => {
    it("dry_run returns a symbolic effect preview, no download or API call", async () => {
      const result = await uploadVideoLogic(
        { adAccountId: "act_1", mediaUrl: "https://x.com/a.mp4", dry_run: true } as any,
        ctx,
        sdk
      );
      expect(graphApiClient.postMultipart).not.toHaveBeenCalled();
      expect(result.videoId).toBeUndefined();
      expect(result.dryRun?.expectedEffect).toEqual({
        effectKind: "asset_uploaded",
        summary: { asset_type: "video" },
      });
      expect(result.dispatchedCapability).toEqual({
        operation: "upload",
        canonicalEntityKind: null,
      });
      expect(() => UploadVideoOutputSchema.parse(result)).not.toThrow();
      expect(() => EffectDryRunResultSchema.parse(result.dryRun)).not.toThrow();
    });

    it("execute returns the effect identity + null-kind capability", async () => {
      graphApiClient.postMultipart.mockResolvedValueOnce({ id: "vid-1" });
      const result = await uploadVideoLogic(
        { adAccountId: "act_1", mediaUrl: "https://x.com/a.mp4" } as any,
        ctx,
        sdk
      );
      expect(graphApiClient.postMultipart).toHaveBeenCalledOnce();
      expect(result.videoId).toBe("vid-1");
      expect(result.effect).toEqual({
        effectKind: "asset_uploaded",
        summary: { asset_type: "video", asset_handle: "vid-1" },
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
      expect(content[0].text).not.toContain("Video uploaded to Meta");
    });
  });
});

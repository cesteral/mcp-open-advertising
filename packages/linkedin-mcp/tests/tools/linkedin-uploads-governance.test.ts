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
      .mockResolvedValue({
        buffer: Buffer.from("x"),
        contentType: "image/jpeg",
        filename: "f.jpg",
      }),
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

const registerResponse = {
  value: {
    uploadMechanism: {
      "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest": {
        uploadUrl: "https://upload.linkedin.com/x",
      },
    },
    asset: "urn:li:digitalmediaAsset:abc",
  },
};

describe("linkedin uploads governance contract (effect class)", () => {
  let client: { post: ReturnType<typeof vi.fn>; putBinary: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    client = {
      post: vi.fn().mockResolvedValue(registerResponse),
      putBinary: vi.fn().mockResolvedValue(undefined),
    };
    mockResolveSessionServices.mockReturnValue({ linkedInService: { client } });
  });

  const cases = [
    {
      label: "linkedin_upload_image",
      logic: uploadImageLogic,
      formatter: uploadImageResponseFormatter,
      schema: UploadImageOutputSchema,
      assetType: "image",
      input: { adAccountUrn: "urn:li:sponsoredAccount:1", mediaUrl: "https://x.com/a.jpg" },
    },
    {
      label: "linkedin_upload_video",
      logic: uploadVideoLogic,
      formatter: uploadVideoResponseFormatter,
      schema: UploadVideoOutputSchema,
      assetType: "video",
      input: { adAccountUrn: "urn:li:sponsoredAccount:1", mediaUrl: "https://x.com/a.mp4" },
    },
  ] as const;

  for (const c of cases) {
    describe(c.label, () => {
      it("dry_run returns a symbolic effect preview, no download or API call", async () => {
        const result = await c.logic({ ...c.input, dry_run: true } as any, ctx, sdk);
        expect(client.post).not.toHaveBeenCalled();
        expect(result.assetUrn).toBeUndefined();
        expect(result.dryRun?.expectedEffect).toEqual({
          effectKind: "asset_uploaded",
          summary: { asset_type: c.assetType },
        });
        expect(result.dispatchedCapability).toEqual({
          operation: "upload",
          canonicalEntityKind: null,
        });
        expect(() => c.schema.parse(result)).not.toThrow();
        expect(() => EffectDryRunResultSchema.parse(result.dryRun)).not.toThrow();
      });

      it("dry_run flags a non-http(s) mediaUrl", async () => {
        const result = await c.logic(
          { ...c.input, mediaUrl: "ftp://x.com/a", dry_run: true } as any,
          ctx,
          sdk
        );
        expect(result.dryRun?.wouldSucceed).toBe(false);
        expect(result.dryRun?.validationErrors[0]?.code).toBe("INVALID_MEDIA_URL");
      });

      it("execute returns the effect identity + null-kind capability", async () => {
        const result = await c.logic({ ...c.input } as any, ctx, sdk);
        expect(client.putBinary).toHaveBeenCalledOnce();
        expect(result.assetUrn).toBe("urn:li:digitalmediaAsset:abc");
        expect(result.effect).toEqual({
          effectKind: "asset_uploaded",
          summary: { asset_type: c.assetType, asset_handle: "urn:li:digitalmediaAsset:abc" },
        });
        expect(result.dispatchedCapability.canonicalEntityKind).toBeNull();
        expect(() => c.schema.parse(result)).not.toThrow();
        expect(() => EffectResultSchema.parse(result.effect)).not.toThrow();
      });

      it("formatter renders a dry-run message without a false success", () => {
        const content = c.formatter({
          uploadedAt: "2026-06-03T00:00:00.000Z",
          dispatchedCapability: { operation: "upload", canonicalEntityKind: null },
          dryRun: {
            wouldSucceed: true,
            validationErrors: [],
            validationSource: "symbolic",
            expectedEffectSource: "symbolic",
            expectedEffect: { effectKind: "asset_uploaded", summary: { asset_type: c.assetType } },
          },
        } as any);
        expect(content[0].text).toContain("would succeed");
        expect(content[0].text).not.toContain("uploaded to LinkedIn");
      });
    });
  }
});

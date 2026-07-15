import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return {
    ...actual,
    downloadFileToBuffer: vi.fn(),
  };
});

const { mockResolveSessionServices } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

import { downloadFileToBuffer } from "@cesteral/shared";
import {
  uploadVideoLogic,
  UploadVideoInputSchema,
} from "../../src/mcp-server/tools/definitions/upload-video.tool.js";
import { extractAssetUploadUrl } from "../../src/services/amazon-dsp/amazon-dsp-service.js";

const mockDownload = vi.mocked(downloadFileToBuffer);
const ctx = { requestId: "r" } as any;
const sdk = { sessionId: "s" } as any;

const baseInput = { name: "Promo", mediaUrl: "https://x.test/v.mp4" };

describe("amazon_dsp_upload_video", () => {
  let mockUpload: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockUpload = vi.fn();
    mockResolveSessionServices.mockReturnValue({
      amazonDspService: { uploadCreativeAsset: mockUpload },
    });
  });

  it("downloads the video and registers a VIDEO asset with DSP context", async () => {
    mockDownload.mockResolvedValue({
      buffer: Buffer.from("vid"),
      contentType: "video/mp4",
      filename: "v.mp4",
    } as any);
    mockUpload.mockResolvedValue({ uploadUrl: "https://s3/u", asset: { assetId: "asset-7" } });

    const result = await uploadVideoLogic(baseInput as any, ctx, sdk);

    expect(mockUpload).toHaveBeenCalledOnce();
    const [fileName, buffer, contentType, registerFields] = mockUpload.mock.calls[0];
    expect(fileName).toBe("v.mp4");
    expect(buffer).toEqual(Buffer.from("vid"));
    expect(contentType).toBe("video/mp4");
    expect(registerFields).toMatchObject({
      name: "Promo",
      assetType: "VIDEO",
      registrationContext: { programName: "AMAZON_DSP" },
    });
    expect(result.assetId).toBe("asset-7");
    expect(result.effect?.effectKind).toBe("asset_uploaded");
    expect(result.effect?.summary.asset_type).toBe("video");
    expect(result.dispatchedCapability).toEqual({ operation: "upload", canonicalEntityKind: null });
  });

  it("dry_run validates without downloading or uploading", async () => {
    const result = await uploadVideoLogic({ ...baseInput, dry_run: true } as any, ctx, sdk);
    expect(mockDownload).not.toHaveBeenCalled();
    expect(mockUpload).not.toHaveBeenCalled();
    expect(result.dryRun?.wouldSucceed).toBe(true);
    expect(result.assetId).toBeUndefined();
  });

  it("requires a valid mediaUrl", () => {
    expect(UploadVideoInputSchema.safeParse({ ...baseInput, mediaUrl: "nope" }).success).toBe(
      false
    );
  });
});

describe("extractAssetUploadUrl", () => {
  it("picks the https URL field from the upload response", () => {
    expect(extractAssetUploadUrl({ url: "https://s3.example/put?sig=1", expiresIn: 900 })).toBe(
      "https://s3.example/put?sig=1"
    );
  });

  it("throws when no upload URL is present", () => {
    expect(() => extractAssetUploadUrl({ expiresIn: 900 })).toThrow(/upload URL/);
  });
});

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
import { extractVideoUploadUrl } from "../../src/services/ttd/ttd-service.js";

const mockDownload = vi.mocked(downloadFileToBuffer);
const ctx = { requestId: "r" } as any;
const sdk = { sessionId: "s" } as any;

const baseInput = {
  advertiserId: "adv1",
  mediaUrl: "https://x.test/v.mp4",
  creativeName: "Promo",
  width: 1920,
  height: 1080,
};

describe("ttd_upload_video", () => {
  let mockUpload: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockUpload = vi.fn();
    mockResolveSessionServices.mockReturnValue({ ttdService: { uploadVideoCreative: mockUpload } });
  });

  it("downloads the video and creates a hosted video creative", async () => {
    mockDownload.mockResolvedValue({
      buffer: Buffer.from("vid"),
      contentType: "video/mp4",
      filename: "v.mp4",
    } as any);
    mockUpload.mockResolvedValue({ CreativeId: "cr-99" });

    const result = await uploadVideoLogic(baseInput as any, ctx, sdk);

    expect(mockUpload).toHaveBeenCalledOnce();
    const [advertiserId, filename, buffer, contentType, creativeFields] = mockUpload.mock.calls[0];
    expect(advertiserId).toBe("adv1");
    expect(filename).toBe("v.mp4");
    expect(buffer).toEqual(Buffer.from("vid"));
    expect(contentType).toBe("video/mp4");
    expect(creativeFields).toMatchObject({ CreativeName: "Promo", Width: 1920, Height: 1080 });
    expect(result.creativeId).toBe("cr-99");
    expect(result.effect?.effectKind).toBe("asset_uploaded");
    expect(result.effect?.summary.asset_type).toBe("video");
    expect(result.dispatchedCapability).toEqual({ operation: "upload", canonicalEntityKind: null });
  });

  it("dry_run validates without downloading or uploading", async () => {
    const result = await uploadVideoLogic({ ...baseInput, dry_run: true } as any, ctx, sdk);
    expect(mockDownload).not.toHaveBeenCalled();
    expect(mockUpload).not.toHaveBeenCalled();
    expect(result.dryRun?.wouldSucceed).toBe(true);
    expect(result.creativeId).toBeUndefined();
  });

  it("rejects a non-positive dimension", () => {
    expect(UploadVideoInputSchema.safeParse({ ...baseInput, width: 0 }).success).toBe(false);
  });

  it("requires a valid mediaUrl", () => {
    expect(UploadVideoInputSchema.safeParse({ ...baseInput, mediaUrl: "not-a-url" }).success).toBe(
      false
    );
  });
});

describe("extractVideoUploadUrl", () => {
  it("picks the https URL field and forwards the rest as attributes", () => {
    const { uploadUrl, uploadAttributes } = extractVideoUploadUrl({
      Url: "https://s3.example/upload?sig=abc",
      VideoUploadAttributes: { Foo: 1 },
      Token: "xyz",
    });
    expect(uploadUrl).toBe("https://s3.example/upload?sig=abc");
    expect(uploadAttributes).toEqual({ VideoUploadAttributes: { Foo: 1 }, Token: "xyz" });
  });

  it("throws when no upload URL is present", () => {
    expect(() => extractVideoUploadUrl({ Token: "xyz" })).toThrow(/upload URL/);
  });
});

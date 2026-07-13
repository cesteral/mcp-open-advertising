import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return {
    ...actual,
    downloadFileToBuffer: vi.fn(),
  };
});

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: vi.fn(),
}));

import { downloadFileToBuffer } from "@cesteral/shared";
import { resolveSessionServices } from "../../src/mcp-server/tools/utils/resolve-session.js";
const mockDownload = vi.mocked(downloadFileToBuffer);
const mockResolve = vi.mocked(resolveSessionServices);

import {
  uploadImageLogic,
  UploadImageInputSchema,
} from "../../src/mcp-server/tools/definitions/upload-image.tool.js";

const mockCreateEntity = vi.fn();
const ctx = { requestId: "r" } as any;
const sdk = { sessionId: "s" } as any;

beforeEach(() => {
  vi.clearAllMocks();
  mockResolve.mockReturnValue({ gadsService: { createEntity: mockCreateEntity } } as any);
});

describe("gads_upload_image", () => {
  it("downloads, base64-encodes, and creates an ImageAsset", async () => {
    mockDownload.mockResolvedValue({ buffer: Buffer.from("img"), contentType: "image/png" } as any);
    mockCreateEntity.mockResolvedValue({
      results: [{ resourceName: "customers/1/assets/999" }],
    });

    const result = await uploadImageLogic(
      { customerId: "1", name: "Banner", mediaUrl: "https://x.test/b.png" } as any,
      ctx,
      sdk
    );

    expect(mockCreateEntity).toHaveBeenCalledOnce();
    const [entityType, customerId, data] = mockCreateEntity.mock.calls[0];
    expect(entityType).toBe("asset");
    expect(customerId).toBe("1");
    expect(data.type).toBe("IMAGE");
    expect(data.imageAsset.mimeType).toBe("IMAGE_PNG");
    expect(data.imageAsset.data).toBe(Buffer.from("img").toString("base64"));
    expect(result.resourceName).toBe("customers/1/assets/999");
    expect(result.effect?.effectKind).toBe("asset_uploaded");
    expect(result.dispatchedCapability).toEqual({ operation: "upload", canonicalEntityKind: null });
  });

  it("rejects an unsupported content type before creating anything", async () => {
    mockDownload.mockResolvedValue({
      buffer: Buffer.from("x"),
      contentType: "application/pdf",
    } as any);

    await expect(
      uploadImageLogic(
        { customerId: "1", name: "Bad", mediaUrl: "https://x.test/b.pdf" } as any,
        ctx,
        sdk
      )
    ).rejects.toThrow(/must be JPEG, PNG, or GIF/);
    expect(mockCreateEntity).not.toHaveBeenCalled();
  });

  it("dry_run validates the URL and does not download or create", async () => {
    const result = await uploadImageLogic(
      { customerId: "1", name: "Banner", mediaUrl: "https://x.test/b.png", dry_run: true } as any,
      ctx,
      sdk
    );
    expect(mockDownload).not.toHaveBeenCalled();
    expect(mockCreateEntity).not.toHaveBeenCalled();
    expect(result.dryRun?.wouldSucceed).toBe(true);
    expect(result.resourceName).toBeUndefined();
  });

  it("requires a numeric customerId", () => {
    expect(
      UploadImageInputSchema.safeParse({
        customerId: "12-34",
        name: "x",
        mediaUrl: "https://x.test/b.png",
      }).success
    ).toBe(false);
  });
});

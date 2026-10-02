// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * `meta_upload_video` sends a HEAD to the caller's `mediaUrl` before the
 * download, to learn its size. Both requests used to follow redirects
 * unchecked, so a public URL could bounce the server to the metadata service.
 * Only `globalThis.fetch` is stubbed; the shared guarded fetch and
 * downloadFileToBuffer are real.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { McpError } from "@cesteral/shared";

const { mockResolveSessionServices } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

vi.mock("../../src/config/index.js", () => ({
  mcpConfig: {
    metaVideoUploadPollIntervalMs: 1,
    metaVideoUploadMaxPollAttempts: 2,
    metaVideoUploadMaxBufferedBytes: 1024,
  },
}));

import { uploadVideoLogic } from "../../src/mcp-server/tools/definitions/upload-video.tool.js";

const MEDIA_URL = "https://cdn.example.com/spot.mp4";
const METADATA = "http://169.254.169.254/computeMetadata/v1/instance/";

let uploadAdVideo: ReturnType<typeof vi.fn>;

beforeEach(() => {
  uploadAdVideo = vi.fn();
  mockResolveSessionServices.mockReturnValue({ metaService: { uploadAdVideo } });
});

afterEach(() => vi.restoreAllMocks());

describe("meta_upload_video mediaUrl redirects", () => {
  it("never requests a redirect target that is internal, on the HEAD or the GET", async () => {
    const sent: Array<{ url: string; method?: string; redirect?: RequestRedirect }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      sent.push({ url: String(input), method: init?.method, redirect: init?.redirect });
      return new Response(null, { status: 302, headers: { location: METADATA } });
    });

    const error = await uploadVideoLogic(
      { adAccountId: "act_1", mediaUrl: MEDIA_URL, dry_run: false } as any,
      { requestId: "req-1" } as any,
      { sessionId: "s-1" } as any
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(McpError);
    expect((error as McpError).message).toMatch(/download redirect refused/);
    expect(sent).toEqual([
      { url: MEDIA_URL, method: "HEAD", redirect: "manual" },
      { url: MEDIA_URL, method: "GET", redirect: "manual" },
    ]);
    expect(uploadAdVideo).not.toHaveBeenCalled();
  });

  it("refuses an internal mediaUrl without sending anything", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(
      uploadVideoLogic(
        { adAccountId: "act_1", mediaUrl: METADATA, dry_run: false } as any,
        { requestId: "req-1" } as any,
        { sessionId: "s-1" } as any
      )
    ).rejects.toThrow(/download URL must use a hostname/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

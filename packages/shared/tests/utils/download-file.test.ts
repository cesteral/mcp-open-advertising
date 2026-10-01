// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, it, expect, vi, afterEach } from "vitest";
import { downloadFileToBuffer, ensureFilenameExtension } from "../../src/utils/download-file.js";

afterEach(() => {
  vi.restoreAllMocks();
});

function mockFetchOnce(opts: {
  status?: number;
  body?: ArrayBuffer | string;
  contentType?: string;
  contentDisposition?: string | null;
}): void {
  const status = opts.status ?? 200;
  const bytes =
    typeof opts.body === "string"
      ? new TextEncoder().encode(opts.body).buffer
      : (opts.body ?? new ArrayBuffer(4));
  const headers = new Headers();
  if (opts.contentType !== undefined) headers.set("content-type", opts.contentType);
  if (opts.contentDisposition !== undefined && opts.contentDisposition !== null) {
    headers.set("content-disposition", opts.contentDisposition);
  }
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers,
    arrayBuffer: async () => bytes,
    text: async () => (typeof opts.body === "string" ? opts.body : ""),
  } as Response);
}

describe("downloadFileToBuffer", () => {
  it("returns buffer + contentType + filename derived from URL when headers don't specify one", async () => {
    mockFetchOnce({
      body: "hello",
      contentType: "text/plain",
    });
    const result = await downloadFileToBuffer("https://cdn.example.com/path/report.csv");
    expect(result.buffer.toString("utf-8")).toBe("hello");
    expect(result.contentType).toBe("text/plain");
    expect(result.filename).toBe("report.csv");
  });

  it("prefers Content-Disposition filename over the URL basename", async () => {
    mockFetchOnce({
      contentType: "application/pdf",
      contentDisposition: 'attachment; filename="invoice-2026.pdf"',
    });
    const result = await downloadFileToBuffer("https://example.com/download?id=42");
    expect(result.filename).toBe("invoice-2026.pdf");
  });

  it("handles RFC 5987 filename* with UTF-8 percent-encoding", async () => {
    mockFetchOnce({
      contentType: "text/plain",
      contentDisposition: "attachment; filename*=UTF-8''r%C3%A9sum%C3%A9.txt",
    });
    const result = await downloadFileToBuffer("https://example.com/x");
    expect(result.filename).toBe("résumé.txt");
  });

  it("strips Content-Type parameters (e.g. charset) when extracting the MIME type", async () => {
    mockFetchOnce({
      body: "x",
      contentType: "application/json; charset=utf-8",
    });
    const result = await downloadFileToBuffer("https://example.com/x.json");
    expect(result.contentType).toBe("application/json");
  });

  it("defaults contentType to application/octet-stream when the server omits the header", async () => {
    mockFetchOnce({ body: "x" });
    const result = await downloadFileToBuffer("https://example.com/x");
    expect(result.contentType).toBe("application/octet-stream");
  });

  it("falls back to file.<ext> derived from contentType when URL has no usable basename", async () => {
    mockFetchOnce({ contentType: "image/png" });
    const result = await downloadFileToBuffer("https://example.com/");
    expect(result.filename).toBe("file.png");
  });

  it("throws with status info when the response is not OK", async () => {
    mockFetchOnce({ status: 404, body: "not found" });
    await expect(downloadFileToBuffer("https://example.com/missing")).rejects.toThrow(/HTTP 404/);
  });

  it("returns a Buffer holding the raw response bytes", async () => {
    const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef]).buffer;
    mockFetchOnce({ body: bytes, contentType: "application/octet-stream" });
    const result = await downloadFileToBuffer("https://example.com/blob");
    expect(result.buffer.length).toBe(4);
    expect(result.buffer[0]).toBe(0xde);
    expect(result.buffer[3]).toBe(0xef);
  });
});

/**
 * Every media-upload tool fetches its caller-supplied `mediaUrl` through
 * downloadFileToBuffer. It used to be a bare fetch: any host, and redirects
 * followed unchecked, so a hosted server could be pointed at the metadata
 * service directly or through a redirect.
 */
describe("downloadFileToBuffer URL and redirect checks", () => {
  function stubRedirects(responses: Array<{ status: number; location?: string; body?: string }>) {
    const sent: Array<{ url: string; redirect: RequestRedirect | undefined }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      sent.push({ url: String(input), redirect: init?.redirect });
      const next = responses.shift();
      if (!next) throw new Error("unexpected request");
      return new Response(next.body ?? null, {
        status: next.status,
        headers: next.location ? { location: next.location } : {},
      });
    });
    return sent;
  }

  it.each([
    "http://169.254.169.254/computeMetadata/v1/instance/service-accounts/default/token",
    "https://metadata.google.internal/computeMetadata/v1/",
    "http://localhost:8080/admin",
    "https://10.0.0.5/x.png",
  ])("refuses %s without requesting it", async (url) => {
    const sent = stubRedirects([{ status: 200, body: "secret" }]);
    await expect(downloadFileToBuffer(url)).rejects.toThrow(/download URL/);
    expect(sent).toHaveLength(0);
  });

  it("refuses a redirect to an internal address before requesting it", async () => {
    const sent = stubRedirects([
      { status: 302, location: "http://169.254.169.254/computeMetadata/v1/" },
    ]);
    await expect(downloadFileToBuffer("https://cdn.example.com/a.png")).rejects.toThrow(
      /redirect refused/
    );
    expect(sent).toEqual([{ url: "https://cdn.example.com/a.png", redirect: "manual" }]);
  });

  it("follows a redirect between public hosts, and still admits http", async () => {
    const sent = stubRedirects([
      { status: 301, location: "https://cdn2.example.com/a.png" },
      { status: 200, body: "png" },
    ]);
    const result = await downloadFileToBuffer("http://cdn.example.com/a.png");
    expect(result.buffer.toString("utf-8")).toBe("png");
    expect(sent.map((s) => s.url)).toEqual([
      "http://cdn.example.com/a.png",
      "https://cdn2.example.com/a.png",
    ]);
  });
});

describe("ensureFilenameExtension", () => {
  it("returns the filename unchanged when it already has an extension", () => {
    expect(ensureFilenameExtension("report.pdf", "image/png")).toBe("report.pdf");
  });

  it("appends an extension derived from contentType when missing", () => {
    expect(ensureFilenameExtension("photo", "image/jpeg")).toBe("photo.jpg");
    expect(ensureFilenameExtension("clip", "video/mp4")).toBe("clip.mp4");
  });

  it("appends .bin when contentType is unrecognized", () => {
    expect(ensureFilenameExtension("blob", "application/x-custom")).toBe("blob.bin");
  });
});

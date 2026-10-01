// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Media uploads draw limiter tokens (#237, snapchat #21).
 *
 * `snapchat_upload_image` and `snapchat_upload_video` used to call the HTTP
 * client through `SnapchatService.client`, so the media create, the binary
 * upload and every status poll bypassed the limiter the server card
 * publishes. They now go through `createMedia` / `uploadMediaFile` /
 * `getMedia`, which draw from the session's entity bucket: each POST as a
 * write (SNAPCHAT_WRITE_TOKENS), each poll as a read.
 *
 * Runs a real session as the transport builds one — a real
 * `SnapchatAccessTokenAdapter` validated against a faked `/v1/me`,
 * `createSessionServices`, the session store and the package's REAL module
 * limiter. Only `fetch` and the source-file download are faked. The requests
 * asserted are the ones the tools sent before this change; only the metering
 * is new.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.hoisted(() => {
  // One poll, no wait: the first status read returns READY.
  process.env.SNAPCHAT_VIDEO_UPLOAD_POLL_INTERVAL_MS = "1";
});

vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return {
    ...actual,
    downloadFileToBuffer: vi.fn(),
  };
});

import pino from "pino";
import { downloadFileToBuffer } from "@cesteral/shared";
import { mcpConfig } from "../../src/config/index.js";
import { rateLimiter } from "../../src/utils/platform.js";
import { SnapchatAccessTokenAdapter } from "../../src/auth/snapchat-auth-adapter.js";
import { createSessionServices, sessionServiceStore } from "../../src/services/session-services.js";
import { snapchatQuotaKey } from "../../src/services/snapchat/rate-limit-keys.js";
import { SNAPCHAT_WRITE_TOKENS } from "../../src/services/snapchat/snapchat-service.js";
import { uploadImageLogic } from "../../src/mcp-server/tools/definitions/upload-image.tool.js";
import { uploadVideoLogic } from "../../src/mcp-server/tools/definitions/upload-video.tool.js";

const ACCOUNT = "acct-1";
const SESSION = "snap-upload-metering";
const USER = "3b8f2c1e-0000-4000-8000-0000000000aa";
const ctx = { requestId: "req-1" } as any;

interface Sent {
  method: string;
  path: string;
}
let sent: Sent[];
let adapter: SnapchatAccessTokenAdapter;

beforeEach(async () => {
  rateLimiter.clear();
  sent = [];
  vi.mocked(downloadFileToBuffer).mockResolvedValue({
    buffer: Buffer.from("bytes"),
    contentType: "image/png",
    filename: "creative.png",
  });
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    sent.push({ method, path: url.pathname });
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    if (url.pathname === "/v1/me") return json({ request_status: "SUCCESS", me: { id: USER } });
    if (method === "POST" && url.pathname.endsWith("/media")) {
      return json({ request_status: "SUCCESS", media: [{ media: { id: "media-1" } }] });
    }
    if (method === "POST" && url.pathname.endsWith("/upload")) {
      return json({ request_status: "SUCCESS" });
    }
    return json({
      request_status: "SUCCESS",
      media: [{ media: { id: "media-1", media_status: "READY" } }],
    });
  });
  adapter = new SnapchatAccessTokenAdapter("token-1", ACCOUNT, mcpConfig.snapchatApiBaseUrl);
  await adapter.validate();
  sessionServiceStore.set(
    SESSION,
    createSessionServices(
      adapter,
      {
        baseUrl: mcpConfig.snapchatApiBaseUrl,
        reportPollIntervalMs: mcpConfig.snapchatReportPollIntervalMs,
        reportMaxPollAttempts: mcpConfig.snapchatReportMaxPollAttempts,
      },
      pino({ level: "silent" }),
      rateLimiter
    )
  );
  sent = []; // drop the /v1/me validation call
});

afterEach(() => {
  sessionServiceStore.delete(SESSION);
  rateLimiter.clear();
  vi.restoreAllMocks();
});

const input = { adAccountId: ACCOUNT, mediaUrl: "https://example.com/creative.png", name: "C" };
const LIMIT = mcpConfig.snapchatRateLimitPerMinute;
const UPLOAD_TOKENS = 2 * SNAPCHAT_WRITE_TOKENS + 1; // create + binary + one READY poll

describe.each([
  ["snapchat_upload_image", uploadImageLogic],
  ["snapchat_upload_video", uploadVideoLogic],
])("%s", (_name, logic) => {
  it("draws two writes and one read from the session's entity bucket", async () => {
    const result = await logic(input as any, ctx, { sessionId: SESSION } as any);

    expect(result.mediaId).toBe("media-1");
    expect(sent).toEqual([
      { method: "POST", path: `/v1/adaccounts/${ACCOUNT}/media` },
      { method: "POST", path: "/v1/media/media-1/upload" },
      { method: "GET", path: "/v1/media/media-1" },
    ]);
    expect(rateLimiter.getRemainingTokens(snapchatQuotaKey(adapter))).toBe(LIMIT - UPLOAD_TOKENS);
  });

  it("a dry run sends nothing and draws nothing", async () => {
    await logic({ ...input, dry_run: true } as any, ctx, { sessionId: SESSION } as any);

    expect(sent).toEqual([]);
    expect(rateLimiter.getRemainingTokens(snapchatQuotaKey(adapter))).toBe(LIMIT);
  });
});

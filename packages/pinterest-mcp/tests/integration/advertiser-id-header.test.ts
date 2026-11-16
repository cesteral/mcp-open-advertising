// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * The header the auth adapter reads the ad account from must be the one the
 * transport admits in a CORS preflight and names in its auth-error hint.
 * They once disagreed (adapter: X-Pinterest-Advertiser-Id; CORS list and hint:
 * X-Pinterest-Ad-Account-Id), so a browser preflight rejected the header the
 * adapter needs and a client following the hint sent one the server ignored.
 */

import { describe, expect, it, vi } from "vitest";
import {
  getPinterestAdvertiserIdFromHeaders,
  PINTEREST_ADVERTISER_ID_HEADER,
} from "../../src/auth/pinterest-auth-adapter.js";
import { createMcpHttpServer } from "../../src/mcp-server/transports/streamable-http-transport.js";

const logger: any = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(),
};
logger.child.mockReturnValue(logger);

const config: any = {
  serviceName: "pinterest-mcp",
  port: 3011,
  host: "127.0.0.1",
  nodeEnv: "test",
  mcpStatefulSessionTimeoutMs: 60_000,
  mcpAuthMode: "pinterest-bearer",
  mcpAllowedOrigins: "*",
  pinterestApiBaseUrl: "https://api.pinterest.com",
  pinterestApiVersion: "v5",
};

describe("pinterest-bearer advertiser-id header", () => {
  it("is the header the adapter reads", () => {
    expect(PINTEREST_ADVERTISER_ID_HEADER).toBe("X-Pinterest-Advertiser-Id");
    expect(
      getPinterestAdvertiserIdFromHeaders({
        [PINTEREST_ADVERTISER_ID_HEADER.toLowerCase()]: "1234567890",
      })
    ).toBe("1234567890");
  });

  it("is allowed by the /mcp CORS preflight", async () => {
    const { app, shutdown } = createMcpHttpServer(config, logger);
    try {
      const res = await app.request("/mcp", {
        method: "OPTIONS",
        headers: {
          Origin: "http://localhost:5173",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": `authorization,${PINTEREST_ADVERTISER_ID_HEADER.toLowerCase()}`,
        },
      });
      const allowed = (res.headers.get("access-control-allow-headers") ?? "")
        .split(",")
        .map((h) => h.trim().toLowerCase());
      expect(allowed).toContain(PINTEREST_ADVERTISER_ID_HEADER.toLowerCase());
      expect(allowed).not.toContain("x-pinterest-ad-account-id");
    } finally {
      await shutdown();
    }
  });

  it("is the header the 401 auth hint tells clients to send", async () => {
    const { app, shutdown } = createMcpHttpServer(config, logger);
    try {
      const res = await app.request("/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
      });
      expect(res.status).toBe(401);
      const body = JSON.stringify(await res.json());
      expect(body).toContain(PINTEREST_ADVERTISER_ID_HEADER);
      expect(body).not.toContain("X-Pinterest-Ad-Account-Id");
    } finally {
      await shutdown();
    }
  });
});

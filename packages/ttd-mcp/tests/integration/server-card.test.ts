// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/auth/ttd-auth-strategy.js", () => ({
  TtdTokenAuthStrategy: class {
    async verify() {
      return { authInfo: { clientId: "x", authType: "ttd-token" }, credentialFingerprint: "fp" };
    }
    async getCredentialFingerprint() {
      return "fp";
    }
  },
}));

vi.mock("../../src/services/session-services.js", () => {
  const store = {
    set: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
    validateFingerprint: vi.fn(() => true),
    getFingerprint: vi.fn(),
    setAuthContext: vi.fn(),
    getAuthContext: vi.fn(),
    isFull: () => false,
    get size() {
      return 0;
    },
  };
  return {
    sessionServiceStore: store,
    createSessionServices: vi.fn(),
    reportCsvStore: { list: () => [], getByUri: () => undefined },
  };
});

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
  serviceName: "ttd-mcp",
  port: 3003,
  host: "127.0.0.1",
  nodeEnv: "test",
  mcpStatefulSessionTimeoutMs: 60_000,
  mcpAuthMode: "ttd-token",
  mcpAllowedOrigins: "*",
  ttdApiBaseUrl: "https://api.thetradedesk.com/v3",
  ttdGraphqlUrl: "https://api.thetradedesk.com/graphql",
};

describe("/.well-known/mcp/server-card.json", () => {
  it("returns the SEP-2127 server card with platform metadata", async () => {
    const { app, shutdown } = createMcpHttpServer(config, logger);
    try {
      const res = await app.request("/.well-known/mcp/server-card.json");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({
        name: "ttd-mcp",
        title: "TTD MCP Server",
        vendor: "Cesteral",
        platform: "The Trade Desk",
        transports: [{ type: "streamable_http", endpoint: "/mcp" }],
        auth: {
          current_mode: "ttd-token",
          supported_modes: ["ttd-token", "ttd-headers", "jwt", "none"],
        },
        capabilities: { tools: true, prompts: true, resources: true, elicitation: true },
      });
      expect(body.mcp_protocol_versions).toContain("2025-11-25");
      expect(typeof body.version).toBe("string");
    } finally {
      await shutdown();
    }
  });

  it("includes oauth_protected_resource pointer only in jwt mode", async () => {
    const { app, shutdown } = createMcpHttpServer({ ...config, mcpAuthMode: "jwt", mcpAuthSecretKey: "x".repeat(32) }, logger);
    try {
      const res = await app.request("/.well-known/mcp/server-card.json");
      const body = await res.json();
      expect(body.auth.oauth_protected_resource).toBe("/.well-known/oauth-protected-resource");
    } finally {
      await shutdown();
    }
  });
});

// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, expect, it, vi } from "vitest";
import { describeServerCard, readServerCard } from "@cesteral/shared/testkit";

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

const serverCard = {
  packageName: "ttd-mcp",
  createServer: createMcpHttpServer,
  platformConfig: {
    port: 3003,
    ttdApiBaseUrl: "https://api.thetradedesk.com/v3",
    ttdGraphqlUrl: "https://api.thetradedesk.com/graphql",
  },
};

describeServerCard(serverCard);

describe("/.well-known/mcp/server-card.json (ttd-mcp)", () => {
  it("returns the SEP-2127 server card with platform metadata", async () => {
    const body = await readServerCard(serverCard);
    expect(body).toMatchObject({
      name: "ttd-mcp",
      title: "The Trade Desk MCP Server",
      vendor: "Cesteral",
      platform: "The Trade Desk",
      transports: [{ type: "streamable_http", endpoint: "/mcp" }],
      auth: {
        current_mode: "ttd-token",
        supported_modes: ["ttd-token", "jwt", "oauth", "none"],
      },
      capabilities: { tools: true, prompts: true, resources: true, elicitation: true },
    });
    expect(body.mcp_protocol_versions).toContain("2025-11-25");
    expect(typeof body.version).toBe("string");
  });

  it("includes oauth_protected_resource pointer only in jwt mode", async () => {
    const body = await readServerCard(serverCard, {
      mcpAuthMode: "jwt",
      mcpAuthSecretKey: "x".repeat(32),
    });
    expect(body.auth.oauth_protected_resource).toBe("/.well-known/oauth-protected-resource");
  });
});

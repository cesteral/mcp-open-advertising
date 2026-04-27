// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { describe, expect, it, vi } from "vitest";
import { createMcpHttpServer } from "../../src/mcp-server/transports/streamable-http-transport.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const registry = JSON.parse(
  readFileSync(resolve(__dirname, "../../../../registry.json"), "utf8")
) as {
  protocol_version: string;
  servers: Array<{
    package: string;
    title: string;
    runtime_description: string;
    platform: string;
    documentation_url: string;
    auth: { modes: string[] };
  }>;
};
const entry = registry.servers.find((s) => s.package === "snapchat-mcp")!;

const logger: any = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(),
};
logger.child.mockReturnValue(logger);

const config: any = {
  serviceName: "snapchat-mcp",
  port: 3009,
  host: "127.0.0.1",
  nodeEnv: "test",
  mcpStatefulSessionTimeoutMs: 60_000,
  mcpAuthMode: entry.auth.modes[0],
  mcpAllowedOrigins: "*",
  snapchatApiBaseUrl: "https://adsapi.snapchat.com",
  snapchatApiVersion: "v1",
};

describe("/.well-known/mcp/server-card.json (snapchat-mcp)", () => {
  it("matches the registry.json entry", async () => {
    const { app, shutdown } = createMcpHttpServer(config, logger);
    try {
      const res = await app.request("/.well-known/mcp/server-card.json");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.name).toBe(entry.package);
      expect(body.title).toBe(entry.title);
      expect(body.auth.current_mode).toBe(entry.auth.modes[0]);
      expect(body.auth.supported_modes).toEqual(entry.auth.modes);
      expect(body.description).toBe(entry.runtime_description);
      expect(body.platform).toBe(entry.platform);
      expect(body.documentation_url).toBe(entry.documentation_url);
      expect(body.mcp_protocol_versions).toContain(registry.protocol_version);
      expect(body.transports).toEqual([{ type: "streamable_http", endpoint: "/mcp" }]);
    } finally {
      await shutdown();
    }
  });
});

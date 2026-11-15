// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

interface RegistryEntry {
  package: string;
  title: string;
  runtime_description: string;
  platform: string;
  documentation_url: string;
  auth: { modes: string[] };
}

interface Registry {
  protocol_version: string;
  servers: RegistryEntry[];
}

/** A server card as served at `/.well-known/mcp/server-card.json`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ServerCard = Record<string, any>;

export interface ServerCardOptions {
  /** The package name in `registry.json`, e.g. `meta-mcp`. */
  packageName: string;
  /** The server's `createMcpHttpServer`. */
  createServer: (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    config: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    logger: any
  ) => {
    app: { request(path: string): Response | Promise<Response> };
    shutdown(): void | Promise<void>;
  };
  /**
   * The server's own config keys: its `port` and platform API settings. The
   * suite supplies the rest (service name, host, auth mode, timeouts).
   */
  platformConfig: Record<string, unknown>;
  /**
   * Tools (full names) the card must declare terminal in
   * `operational.rollback.terminalOperations`: the ones that can write a value
   * the platform cannot undo. Omit when the server declares none.
   */
  terminalTools?: readonly string[];
}

/** `registry.json` sits at the repo root; find it from the running package. */
function loadRegistry(): Registry {
  let dir = process.cwd();
  for (;;) {
    const candidate = resolve(dir, "registry.json");
    if (existsSync(candidate)) return JSON.parse(readFileSync(candidate, "utf8")) as Registry;
    const parent = dirname(dir);
    if (parent === dir) throw new Error("registry.json not found above " + process.cwd());
    dir = parent;
  }
}

function registryEntry(registry: Registry, packageName: string): RegistryEntry {
  const entry = registry.servers.find((s) => s.package === packageName);
  if (!entry) throw new Error(`${packageName} is not in registry.json`);
  return entry;
}

function createLogger() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const logger: any = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
  };
  logger.child.mockReturnValue(logger);
  return logger;
}

/**
 * Boot the server with the suite's test config (plus `overrides`), request its
 * server card, and shut the server down. For per-server assertions beside
 * {@link describeServerCard}.
 */
export async function readServerCard(
  options: ServerCardOptions,
  overrides: Record<string, unknown> = {}
): Promise<ServerCard> {
  const entry = registryEntry(loadRegistry(), options.packageName);
  const { app, shutdown } = options.createServer(
    {
      serviceName: options.packageName,
      host: "127.0.0.1",
      nodeEnv: "test",
      mcpStatefulSessionTimeoutMs: 60_000,
      mcpAuthMode: entry.auth.modes[0],
      mcpAllowedOrigins: "*",
      ...options.platformConfig,
      ...overrides,
    },
    createLogger()
  );
  try {
    const res = await app.request("/.well-known/mcp/server-card.json");
    expect(res.status).toBe(200);
    return (await res.json()) as ServerCard;
  } finally {
    await shutdown();
  }
}

/**
 * The server card of one server matches its `registry.json` entry: name,
 * title, auth modes, description, platform, documentation URL, protocol
 * version and transports.
 */
export function describeServerCard(options: ServerCardOptions): void {
  describe(`/.well-known/mcp/server-card.json (${options.packageName})`, () => {
    it("matches the registry.json entry", async () => {
      const registry = loadRegistry();
      const entry = registryEntry(registry, options.packageName);
      const body = await readServerCard(options);
      expect(body.name).toBe(entry.package);
      expect(body.title).toBe(entry.title);
      expect(body.auth.current_mode).toBe(entry.auth.modes[0]);
      expect(body.auth.supported_modes).toEqual(entry.auth.modes);
      expect(body.description).toBe(entry.runtime_description);
      expect(body.platform).toBe(entry.platform);
      expect(body.documentation_url).toBe(entry.documentation_url);
      expect(body.mcp_protocol_versions).toContain(registry.protocol_version);
      expect(body.transports).toEqual([{ type: "streamable_http", endpoint: "/mcp" }]);
    });

    const { terminalTools } = options;
    if (terminalTools) {
      it(`declares ${terminalTools.join(", ")} terminal`, async () => {
        const body = await readServerCard(options);
        const terminal = body.operational.rollback.terminalOperations.map(
          (t: { tool: string }) => t.tool
        );
        expect(terminal).toEqual(expect.arrayContaining([...terminalTools]));
      });
    }
  });
}

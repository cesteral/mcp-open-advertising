// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { existsSync, readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { describe, expect, it } from "vitest";
import { SUPPORTED_PROTOCOL_VERSIONS } from "../../src/utils/mcp-transport-helpers.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../../..");
const registryPath = resolve(repoRoot, "registry.json");

interface RegistryServer {
  package: string;
  title: string;
  description: string;
  runtime_description: string;
  platform: string;
  platform_display_name: string;
  documentation_url: string;
  tools: string[];
  resources?: string[];
  prompts?: string[];
  auth: { modes: string[] };
  tags?: string[];
}

interface Registry {
  protocol_version: string;
  servers: RegistryServer[];
}

const registry: Registry = JSON.parse(readFileSync(registryPath, "utf8"));

describe("registry.json ↔ server-card consistency", () => {
  it("declares a protocol_version that the runtime supports", () => {
    expect(SUPPORTED_PROTOCOL_VERSIONS).toContain(registry.protocol_version);
  });

  it("lists exactly the 13 production servers", () => {
    expect(registry.servers).toHaveLength(13);
  });

  it.each(registry.servers.map((s) => [s.package, s] as const))(
    "%s: registry entry is well-formed and points to a real package",
    (_name, server) => {
      expect(server.package).toMatch(/^[a-z0-9-]+-mcp$/);
      expect(server.title).toMatch(/MCP Server$/);
      expect(server.description.length).toBeGreaterThan(20);
      expect(server.runtime_description.length).toBeGreaterThan(20);
      expect(server.platform.length).toBeGreaterThan(0);
      expect(server.platform_display_name.length).toBeGreaterThan(0);
      expect(server.documentation_url).toMatch(/^https?:\/\//);
      expect(server.tools.length).toBeGreaterThan(0);
      expect(server.auth.modes.length).toBeGreaterThan(0);
      expect(server.auth.modes).toContain("none");

      const pkgDir = resolve(repoRoot, "packages", server.package);
      expect(existsSync(pkgDir)).toBe(true);
      expect(existsSync(resolve(pkgDir, "package.json"))).toBe(true);
    }
  );

  it("registry tool names are unique within each server", () => {
    for (const server of registry.servers) {
      const unique = new Set(server.tools);
      expect(unique.size, `${server.package} has duplicate tool names`).toBe(server.tools.length);
    }
  });

  it("every auth mode follows the documented naming pattern", () => {
    const validModePattern = /^([a-z0-9-]+|jwt|none)$/;
    for (const server of registry.servers) {
      for (const mode of server.auth.modes) {
        expect(mode, `${server.package} mode "${mode}"`).toMatch(validModePattern);
      }
    }
  });
});

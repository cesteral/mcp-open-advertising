// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// The `client` block of registry.json is what the generated Claude Code and
// Codex configs are built from, so it has to match what each server really reads.
// This test checks the block's shape, that every env var it names is read by the
// package, that a server started without credentials asks for exactly the names
// the registry lists, and that the generated files are current.
//
// It starts each server's built entry point once, with an empty environment and
// no network use: a server with no credentials logs its list of needed variables
// and exits. That is why it boots servers itself rather than using the fleet
// snapshot (scripts/README.md).

import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "./boot-server.mjs";
import {
  claudeCodeHttp,
  claudeCodeStdio,
  codexHttp,
  codexStdio,
  httpHeaders,
  inSnippet,
  serverKey,
  stdioEnv,
} from "./client-configs.mjs";

const registry = JSON.parse(readFileSync(join(ROOT, "registry.json"), "utf8"));
const REQUIREMENTS = ["required", "optional", "alternative"];

function sourceText(pkg) {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (path.endsWith(".ts")) out.push(readFileSync(path, "utf8"));
    }
  };
  walk(join(ROOT, "packages", pkg, "src"));
  return out.join("\n");
}

describe.each(registry.servers.map((s) => [s.package, s]))("client block: %s", (pkg, server) => {
  const env = server.client?.stdio?.env ?? [];
  const headers = server.client?.http?.headers ?? [];

  it("has a stdio and an http section", () => {
    expect(env.length).toBeGreaterThan(0);
    expect(headers.length).toBeGreaterThan(0);
  });

  it("describes every entry completely and names no variable twice", () => {
    const names = env.map((e) => e.name);
    expect(new Set(names).size).toBe(names.length);
    for (const e of env) {
      expect(REQUIREMENTS, e.name).toContain(e.requirement);
      expect(typeof e.secret, e.name).toBe("boolean");
      expect(e.description, e.name).toBeTruthy();
      if (e.requirement === "alternative") expect(e.group, e.name).toBeTruthy();
    }
    for (const h of headers) {
      expect(REQUIREMENTS, h.name).toContain(h.requirement);
      expect(h.description, h.name).toBeTruthy();
      // A header's value is either fixed or comes from a variable the user exports.
      expect(Boolean(h.value) !== Boolean(h.env), h.name).toBe(true);
    }
  });

  it("puts at least one credential in the stdio snippet", () => {
    expect(stdioEnv(server).length).toBeGreaterThan(0);
  });

  it("names only variables the package reads", () => {
    const src = sourceText(pkg);
    for (const e of env) expect(src, `${e.name} is not read in ${pkg}/src`).toContain(e.name);
  });

  it("asks, when started without credentials, for exactly the variables the registry lists", () => {
    const run = spawnSync("node", [join(ROOT, "packages", pkg, "dist", "index.js")], {
      cwd: ROOT,
      env: { PATH: process.env.PATH, HOME: "/nonexistent", MCP_TRANSPORT_MODE: "stdio" },
      stdio: ["ignore", "ignore", "pipe"],
      encoding: "utf8",
      timeout: 45_000,
    });
    const warning = run.stderr
      .split("\n")
      .map((line) => {
        try {
          return JSON.parse(line).msg ?? "";
        } catch {
          return "";
        }
      })
      .find((msg) => /\bSet [A-Z]/.test(msg));
    expect(warning, `no credential warning in:\n${run.stderr}`).toBeTruthy();
    const mentioned = new Set(warning.match(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g) ?? []);
    const needed = new Set(env.filter((e) => e.requirement !== "optional").map((e) => e.name));
    expect([...mentioned].sort()).toEqual([...needed].sort());
  });

  it("renders configs that use only the snippet entries", () => {
    const cc = claudeCodeStdio(server);
    expect(Object.keys(cc.env).sort()).toEqual(
      ["MCP_TRANSPORT_MODE", ...stdioEnv(server).map((e) => e.name)].sort()
    );
    expect(codexStdio(server)).toContain(`[mcp_servers.${serverKey(server)}]`);
    expect(Object.keys(claudeCodeHttp(server).headers)).toEqual(
      httpHeaders(server).map((h) => h.name)
    );
    // An optional entry in a snippet would reach the server as the literal "${VAR}".
    for (const e of [...env, ...headers]) {
      if (!inSnippet(e)) {
        expect(JSON.stringify(cc)).not.toContain("${" + e.name + "}");
      }
    }
  });

  it("offers Codex over HTTP only when one bearer token is all the server needs", () => {
    const hs = httpHeaders(server);
    const bearerOnly = hs.length === 1 && hs[0].name === "Authorization";
    expect(codexHttp(server) !== null).toBe(bearerOnly);
  });
});

describe("generated files", () => {
  it("are current (pnpm run generate:client-configs)", () => {
    const run = spawnSync(
      "node",
      [join(ROOT, "scripts/generate/generate-client-configs.mjs"), "--check"],
      {
        cwd: ROOT,
        encoding: "utf8",
      }
    );
    expect(run.stderr + run.stdout).toContain("up to date");
    expect(run.status).toBe(0);
  });
});

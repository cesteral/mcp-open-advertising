// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// The `client` block of registry.json is what the generated Claude Code and
// Codex configs are built from, so it has to match what each server really reads.
// This test checks the block's shape, that every env var it names is read by the
// package, that a server started without credentials asks for exactly the names
// the registry lists, and that the generated files are current. What the block
// says about a credential FLOW (for example that Amazon DSP's static token needs
// a client ID) cannot be seen from a startup message; those are wire tests in the
// package (amazon-dsp-mcp/tests/auth/client-config-credentials.test.ts).
//
// It starts each server's built entry point once, with an empty environment, from
// an empty temporary directory (the servers read `.env` from the working
// directory, so a developer's own file must not reach the run). A server with no
// credentials logs the list of variables it needs and exits 1, with no network
// use. That is why this suite boots servers itself rather than using the fleet
// snapshot (scripts/README.md).

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { ROOT } from "./boot-server.mjs";
import {
  checkClientBlocks,
  claudeCodeHttp,
  claudeCodeStdio,
  codexHttp,
  codexStdio,
  httpHeaders,
  inSnippet,
  referenceDocument,
  serverKey,
  stdioEnv,
} from "./client-configs.mjs";
import { deployableServers } from "./server-status.mjs";

const registry = JSON.parse(readFileSync(join(ROOT, "registry.json"), "utf8"));
const published = deployableServers(registry);

const workDir = mkdtempSync(join(tmpdir(), "client-configs-"));
afterAll(() => rmSync(workDir, { recursive: true, force: true }));

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

/** The JSON `msg` of every log line the process wrote. */
function logMessages(stderr) {
  return stderr.split("\n").map((line) => {
    try {
      return JSON.parse(line).msg ?? "";
    } catch {
      return "";
    }
  });
}

describe("client blocks of the published servers", () => {
  it("are complete", () => {
    expect(checkClientBlocks(published)).toEqual([]);
  });

  it("are required of a stable server and ignored for an experimental one", () => {
    const stable = { ...published[0], client: undefined };
    expect(checkClientBlocks([stable]).join("\n")).toContain("needs `stdio.env`");
    // A scaffolded server has no block, is never published, and must not break the renderer.
    const experimental = {
      ...published[0],
      package: "never-published-mcp",
      status: "experimental",
      client: undefined,
    };
    const doc = referenceDocument({ servers: [...registry.servers, experimental] });
    expect(doc).not.toContain("never-published-mcp");
    expect(doc).toContain(serverKey(published[0]));
  });

  it("report the mistakes a hand-edited block can contain", () => {
    const broken = structuredClone(published[0]);
    broken.client.stdio.env[0].requirement = "sometimes";
    broken.client.http.headers[0].env = undefined;
    broken.client.http.headers[0].value = undefined;
    const found = checkClientBlocks([broken]).join("\n");
    expect(found).toContain("requirement must be one of");
    expect(found).toContain("exactly one of value");
  });
});

describe.each(published.map((s) => [s.package, s]))("client block: %s", (pkg, server) => {
  const env = server.client.stdio.env;

  it("names only variables the package reads", () => {
    const src = sourceText(pkg);
    for (const e of env) expect(src, `${e.name} is not read in ${pkg}/src`).toContain(e.name);
  });

  it("asks, when started without credentials, for exactly the variables the registry lists", () => {
    const run = spawnSync("node", [join(ROOT, "packages", pkg, "dist", "index.js")], {
      cwd: workDir,
      env: { PATH: process.env.PATH, HOME: workDir, MCP_TRANSPORT_MODE: "stdio" },
      stdio: ["ignore", "ignore", "pipe"],
      encoding: "utf8",
      timeout: 45_000,
    });
    expect(run.status, `expected exit 1 without credentials:\n${run.stderr}`).toBe(1);
    const warning = logMessages(run.stderr).find((msg) => /\bSet [A-Z]/.test(msg));
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
    for (const e of env) {
      if (!inSnippet(e)) expect(JSON.stringify(cc)).not.toContain("${" + e.name + "}");
    }
  });

  it("renders a Codex HTTP table that carries every snippet header", () => {
    const toml = codexHttp(server);
    expect(toml, "Codex cannot express one of this server's headers").not.toBeNull();
    const fromEnv = httpHeaders(server).filter((h) => h.name !== "Authorization" && !h.value);
    for (const h of httpHeaders(server)) {
      if (h.name === "Authorization") {
        expect(toml).toContain(`bearer_token_env_var = "${h.env}"`);
      } else {
        expect(toml).toContain(`"${h.name}" = "${h.value ?? h.env}"`);
      }
    }
    expect(toml.includes("env_http_headers")).toBe(fromEnv.length > 0);
  });
});

describe("generated files", () => {
  it("are current (pnpm run generate:client-configs)", () => {
    const run = spawnSync(
      "node",
      [join(ROOT, "scripts/generate/generate-client-configs.mjs"), "--check"],
      { cwd: ROOT, encoding: "utf8" }
    );
    expect(run.stderr + run.stdout).toContain("up to date");
    expect(run.status).toBe(0);
  });
});

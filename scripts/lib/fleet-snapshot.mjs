// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// What a booted server tells a client, collected in ONE boot per server.
//
// The root `scripts` suite used to boot servers per test file, and most files
// boot all 13: 316 in-process boots per run, each one a cold import of a
// server's whole dist graph in a fresh vitest worker. The suites mostly ask the
// same questions of the same servers (`tools/list`, `serverInfo`, the prompt
// and resource text), so vitest's `globalSetup` asks them once
// (fleet-snapshot-global-setup.mjs) and every file reads the answer
// (fleet-snapshot-inject.mjs).
//
// A suite that has to DRIVE a server (call tools, run search queries) or that
// is checking boot-to-boot behaviour still boots its own: see
// scripts/README.md for which and why. Everything here is plain JSON, because
// vitest hands it to the workers by serialising it.

import { execFile } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { ROOT, withServerClient, listRawTools, IDENTITY_SCHEMA } from "./boot-server.mjs";

/**
 * Argument sets a prompt is rendered with, besides "every required argument is
 * the string `x`" (which every prompt gets). The cross-platform prompts are
 * checked byte for byte against @cesteral/shared for each of these
 * (cross-platform-prompts.test.mjs), so they are rendered here, once, rather
 * than by a boot per suite.
 */
export const PROMPT_ARG_SETS = {
  cross_platform_campaign_setup: [
    {},
    { totalBudget: "50000", objective: "awareness", currency: "EUR" },
  ],
  cross_platform_performance_comparison: [
    {},
    { dateRange: "LAST_30_DAYS" },
    { dateRange: "2026-03-01 to 2026-03-31" },
  ],
};

/** Every `*-mcp` package, sorted: the fleet the root suites iterate. */
export function fleetPackages() {
  return readdirSync(join(ROOT, "packages"))
    .filter((p) => p.endsWith("-mcp"))
    .sort();
}

const textOfMessages = (result) =>
  (result.messages ?? []).map((m) => m.content?.text ?? "").join("\n");

async function renderPrompt(client, prompt) {
  const requiredAsX = {};
  for (const arg of prompt.arguments ?? []) if (arg.required) requiredAsX[arg.name] = "x";

  const argumentSets = [requiredAsX, ...(PROMPT_ARG_SETS[prompt.name] ?? [])];
  const seen = new Set();
  const renders = [];
  for (const args of argumentSets) {
    const key = JSON.stringify(args);
    if (seen.has(key)) continue;
    seen.add(key);
    const result = await client.request(
      { method: "prompts/get", params: { name: prompt.name, arguments: args } },
      IDENTITY_SCHEMA
    );
    renders.push({ arguments: args, text: textOfMessages(result) });
  }
  return renders;
}

const execFileAsync = promisify(execFile);

/**
 * The 2026-07-28 `ttlMs` / `cacheScope` the server advertises (#248). The SDK
 * serves that era only through `createMcpHandler`, so a child process
 * (cache-hints-probe.mjs) drives the server's factory through it. A child, not
 * an import: vitest's module graph and Node's would load the SDK twice, and the
 * handler refuses a server built from another copy of its classes.
 */
async function snapshotCacheHints(pkg) {
  const { stdout } = await execFileAsync(
    process.execPath,
    [join(ROOT, "scripts", "lib", "cache-hints-probe.mjs"), pkg],
    { maxBuffer: 16 * 1024 * 1024 }
  );
  return JSON.parse(stdout);
}

/**
 * Boots `pkg` once and returns:
 *   serverVersion  the `initialize` serverInfo (name, title, version, ...)
 *   capabilities   the server's advertised capabilities
 *   tools          every tool as the raw `tools/list` wire object
 *   prompts        [{ prompt, renders: [{ arguments, text }] }]
 *   resources      [{ uri, text }]
 *   cacheHints     the 2026-07-28 ttlMs / cacheScope per list method and resource read
 */
export async function snapshotServer(pkg) {
  const cacheHints = await snapshotCacheHints(pkg);
  return withServerClient(pkg, async (client) => {
    const capabilities = client.getServerCapabilities() ?? {};
    const tools = await listRawTools(client);

    const prompts = [];
    if (capabilities.prompts) {
      const listed = await client.request({ method: "prompts/list", params: {} }, IDENTITY_SCHEMA);
      for (const prompt of listed.prompts) {
        prompts.push({ prompt, renders: await renderPrompt(client, prompt) });
      }
    }

    const resources = [];
    if (capabilities.resources) {
      const listed = await client.request(
        { method: "resources/list", params: {} },
        IDENTITY_SCHEMA
      );
      for (const { uri } of listed.resources) {
        const result = await client.request(
          { method: "resources/read", params: { uri } },
          IDENTITY_SCHEMA
        );
        resources.push({ uri, text: (result.contents ?? []).map((c) => c.text ?? "").join("\n") });
      }
    }

    return {
      serverVersion: client.getServerVersion(),
      capabilities,
      tools,
      prompts,
      resources,
      cacheHints,
    };
  });
}

/** `{ [package]: snapshotServer(package) }` for the whole fleet, one boot each. */
export async function snapshotFleet() {
  const fleet = {};
  for (const pkg of fleetPackages()) fleet[pkg] = await snapshotServer(pkg);
  return fleet;
}

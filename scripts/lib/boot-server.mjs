// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// Shared harness for booting a built MCP server in-process and introspecting
// it over an in-memory transport. Used by check-registry-runtime.mjs (tool
// name-drift check) and generate-manifests.mjs (attestation hashing).

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Absolute path to the repository root. */
export const ROOT = join(__dirname, "..", "..");

// A no-op logger satisfying the pino-shaped interface createMcpServer expects.
const SILENT_LOGGER = new Proxy(
  {},
  {
    get: (_target, prop) => {
      if (prop === "child") return () => SILENT_LOGGER;
      if (prop === "level") return "silent";
      return () => {};
    },
  }
);

/**
 * Boots the built MCP server for `packageDir` (e.g. "meta-mcp"), runs `fn`
 * with a connected MCP Client, and tears everything down afterwards.
 * Requires `pnpm run build` to have produced the server's dist output.
 */
export async function withServerClient(packageDir, fn) {
  const distServerPath = join(ROOT, "packages", packageDir, "dist", "mcp-server", "server.js");
  if (!existsSync(distServerPath)) {
    throw new Error(
      `Built server not found: ${distServerPath}. Run \`pnpm run build\` before this script.`
    );
  }

  const mod = await import(pathToFileURL(distServerPath).href);
  if (typeof mod.createMcpServer !== "function") {
    throw new Error(`${packageDir} does not export createMcpServer from server.js`);
  }

  const server = await mod.createMcpServer(SILENT_LOGGER);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "cesteral-tooling", version: "0.0.0" }, { capabilities: {} });

  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  try {
    return await fn(client);
  } finally {
    await client.close().catch(() => {});
    await server.close().catch(() => {});
  }
}

// The SDK client's own result schemas parse each tool's annotations through a
// non-passthrough schema, which silently strips the `cesteral` governance
// namespace: a `client.request()` with no result schema returns tools without
// it. SDK v2 validates a request's result with the Standard Schema passed as
// its second argument instead (https://standardschema.dev), so an identity
// Standard Schema returns the raw `tools/list` result untouched — the exact
// representation governance ingests and hashes (#242: SDK v1 called
// `.safeParse()` on this argument; v2 calls `~standard.validate`).
export const IDENTITY_SCHEMA = {
  "~standard": {
    version: 1,
    vendor: "cesteral-identity",
    validate: (value) => ({ value }),
  },
};

/**
 * Every tool the server advertises over `tools/list`, paginated, as raw wire
 * objects with the `cesteral` annotation namespace intact.
 */
export async function listRawTools(client) {
  const tools = [];
  let cursor;
  do {
    const result = await client.request(
      { method: "tools/list", params: cursor ? { cursor } : {} },
      IDENTITY_SCHEMA
    );
    for (const tool of result.tools ?? []) tools.push(tool);
    cursor = result.nextCursor;
  } while (cursor);
  return tools;
}

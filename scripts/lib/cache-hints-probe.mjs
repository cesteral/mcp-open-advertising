// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// `node scripts/lib/cache-hints-probe.mjs <package>` prints the 2026-07-28
// cache hints (`ttlMs` / `cacheScope`, #248) a built server advertises, as JSON:
//   { "tools/list": {..}, "prompts/list": {..}, "resources/list": {..},
//     "resources/templates/list": {..}, "reads": { "<uri>": {..} } }
// A hint is null when the server does not serve that method.
//
// The SDK serves the 2026 era only through `createMcpHandler` (an in-memory
// transport speaks 2025). This runs as its own process so the SDK loads once,
// natively: see snapshotCacheHints in fleet-snapshot.mjs.

import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const pkg = process.argv[2];
if (!pkg) throw new Error("usage: cache-hints-probe.mjs <package>");

const MODERN = "2026-07-28";
const SILENT = new Proxy(
  {},
  {
    get: (_t, prop) => (prop === "child" ? () => SILENT : prop === "level" ? "silent" : () => {}),
  }
);

// The ESM build, by path: `require.resolve` alone would pick the CJS build, a
// second copy of the SDK classes the server was built from. The root package
// has no SDK server dependency, so it is resolved from @cesteral/shared.
const requireFromShared = createRequire(join(ROOT, "packages", "shared", "package.json"));
const sdkDist = dirname(requireFromShared.resolve("@modelcontextprotocol/server"));
const sdk = await import(pathToFileURL(join(sdkDist, "index.mjs")).href);
const { createMcpServer } = await import(
  pathToFileURL(join(ROOT, "packages", pkg, "dist", "mcp-server", "server.js")).href
);
const handler = sdk.createMcpHandler(() => createMcpServer(SILENT));

async function call(method, params = {}) {
  const res = await handler.fetch(
    new Request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-method": method,
        "mcp-protocol-version": MODERN,
        ...(params.uri && { "mcp-name": params.uri }),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method,
        params: {
          ...params,
          _meta: {
            [sdk.PROTOCOL_VERSION_META_KEY]: MODERN,
            [sdk.CLIENT_INFO_META_KEY]: { name: "cesteral-tooling", version: "0.0.0" },
            [sdk.CLIENT_CAPABILITIES_META_KEY]: {},
          },
        },
      }),
    })
  );
  return (await res.json()).result;
}

const hintOf = (r) => (r ? { ttlMs: r.ttlMs, cacheScope: r.cacheScope } : null);

const hints = { reads: {} };
const listed = await call("resources/list");
for (const method of ["tools/list", "prompts/list", "resources/templates/list"]) {
  hints[method] = hintOf(await call(method));
}
hints["resources/list"] = hintOf(listed);
// The hint is per registration, so one read per URI scheme speaks for the lot.
const seenSchemes = new Set();
for (const { uri } of listed?.resources ?? []) {
  const scheme = uri.split(":")[0];
  if (seenSchemes.has(scheme)) continue;
  seenSchemes.add(scheme);
  hints.reads[uri] = hintOf(await call("resources/read", { uri }));
}
process.stdout.write(JSON.stringify(hints));
process.exit(0);

// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.

/**
 * #248: the cache hints (`ttlMs` / `cacheScope`, MCP 2026-07-28) must reach a
 * client through the real SDK, and `report-csv://` must never be `public`.
 */

import { describe, it, expect } from "vitest";
import pino from "pino";
import {
  McpServer,
  ResourceTemplate,
  createMcpHandler,
  PROTOCOL_VERSION_META_KEY,
  CLIENT_INFO_META_KEY,
  CLIENT_CAPABILITIES_META_KEY,
} from "@modelcontextprotocol/server";
import { createPlatformMcpServer } from "../../src/utils/mcp/platform-server-factory.js";
import { registerReportCsvResource } from "../../src/utils/reporting/report-csv-resource.js";
import { ReportCsvStore } from "../../src/utils/reporting/report-csv-store.js";
import { withStandardMcpHeaders } from "../../src/utils/transport/mcp-http-transport-factory.js";

const logger = pino({ level: "silent" });
const PROTOCOL = "2026-07-28";

/**
 * A modern-era (2026-07-28) request through the SDK's own HTTP handler, the one
 * place the SDK serves that era. `build` is the factory under test.
 */
function modernCaller(build: () => Promise<McpServer>) {
  const handler = createMcpHandler(() => build());
  return async (method: string, params: Record<string, unknown> = {}) => {
    const res = await handler.fetch(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "mcp-method": method,
          "mcp-protocol-version": PROTOCOL,
          ...(typeof params.uri === "string" && { "mcp-name": params.uri }),
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method,
          params: {
            ...params,
            _meta: {
              [PROTOCOL_VERSION_META_KEY]: PROTOCOL,
              [CLIENT_INFO_META_KEY]: { name: "c", version: "0.0.0" },
              [CLIENT_CAPABILITIES_META_KEY]: {},
            },
          },
        }),
      })
    );
    const body = (await res.json()) as { result?: Record<string, unknown>; error?: unknown };
    if (!body.result) throw new Error(`${method}: ${JSON.stringify(body)}`);
    return body.result;
  };
}

function platformServer(withReportCsv: boolean, store: ReportCsvStore) {
  return () =>
    createPlatformMcpServer({
      sdk: { McpServer: McpServer as never, ResourceTemplate: ResourceTemplate as never },
      logger,
      packageName: "ttd-mcp",
      platform: "probe",
      version: "0.0.0",
      description: "probe",
      instructions: "probe",
      tools: [],
      extraCapabilities: { tools: {} },
      resources: [
        {
          uri: "entity-schema://probe",
          name: "Probe schema",
          description: "static",
          mimeType: "application/json",
          getContent: () => "{}",
        },
      ],
      templatedResources: [
        {
          uriTemplate: "entity-examples://{type}",
          name: "Probe examples",
          description: "static",
          mimeType: "application/json",
          resolveContent: () => "{}",
        },
      ],
      prompts: [{ prompt: { name: "p", description: "p" }, generateMessage: () => "p" }],
      sessionServiceStore: { getAuthContext: () => undefined, delete: () => undefined },
      ...(withReportCsv && {
        reportCsv: { store, platformLabel: "Probe", downloadToolName: "probe_download_report" },
      }),
    } as never) as Promise<McpServer>;
}

describe("cache hints (#248)", () => {
  it("advertises the catalogs and static resources as public with a long TTL", async () => {
    const call = modernCaller(platformServer(false, new ReportCsvStore()));
    for (const method of [
      "tools/list",
      "prompts/list",
      "resources/templates/list",
      "resources/list",
    ]) {
      expect(await call(method), method).toMatchObject({ ttlMs: 3_600_000, cacheScope: "public" });
    }
    for (const uri of ["entity-schema://probe", "entity-examples://anything"]) {
      expect(await call("resources/read", { uri }), uri).toMatchObject({
        ttlMs: 3_600_000,
        cacheScope: "public",
      });
    }
  });

  it("never serves report-csv:// as public, and caps its TTL at the entry's expiry", async () => {
    const store = new ReportCsvStore();
    const entry = store.store({ csv: "a\n1\n" });
    const call = modernCaller(platformServer(true, store));

    const sent = Date.now();
    const read = await call("resources/read", { uri: `report-csv://${entry.resourceId}` });
    expect(read.cacheScope).toBe("private");
    expect(read.ttlMs as number).toBeGreaterThanOrEqual(0);
    expect(read.ttlMs as number).toBeLessThanOrEqual(entry.expiresAt - sent);

    // The listing carries per-session report URIs, so it is not public either.
    expect((await call("resources/list")).cacheScope).toBe("private");
  });

  it("keeps report-csv:// private even if a server-wide read policy were public", async () => {
    const store = new ReportCsvStore();
    const entry = store.store({ csv: "a\n1\n" });
    const call = modernCaller(async () => {
      const server = new McpServer(
        { name: "p", version: "0" },
        { cacheHints: { "resources/read": { ttlMs: 3_600_000, cacheScope: "public" } } }
      );
      registerReportCsvResource({
        server: server as never,
        ResourceTemplate: ResourceTemplate as never,
        store,
        platform: "Probe",
        downloadToolName: "probe_download_report",
        logger,
      });
      return server;
    });
    const read = await call("resources/read", { uri: `report-csv://${entry.resourceId}` });
    expect(read.cacheScope).toBe("private");
  });
});

describe("withStandardMcpHeaders (#248)", () => {
  it("adds the SEP-2243 headers once, case-insensitively", () => {
    const out = withStandardMcpHeaders(["Content-Type", "mcp-protocol-version"]);
    expect(out).toEqual(["Content-Type", "mcp-protocol-version", "Mcp-Method", "Mcp-Name"]);
  });
});

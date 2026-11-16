// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * The testkit suites run here against fixtures that satisfy them, so a change
 * to a suite that breaks it for a conforming server fails in this package. A
 * server that does not conform fails in its own package; the failing direction
 * is exercised by breaking a real server (see the PR that introduced the testkit).
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  ENTITY_CRUD_TOOLS,
  describeCrossServerContract,
  describeSchemaSizeGuard,
  describeServerCard,
  readServerCard,
  type ContractTool,
} from "../../src/testkit/index.js";

function tool(
  name: string,
  outputShape: z.ZodRawShape = {}
): ContractTool & {
  inputSchema: z.ZodTypeAny;
  outputSchema: z.ZodTypeAny;
} {
  return {
    name,
    title: name,
    description: `${name} fixture tool`,
    inputSchema: z.object({}),
    outputSchema: z.object(outputShape),
    inputExamples: [{ label: "empty", input: {} }],
    annotations: { readOnlyHint: false, destructiveHint: true },
    logic: () => undefined,
    responseFormatter: () => [],
  };
}

const bulkOutput = {
  results: z.array(z.unknown()),
  successCount: z.number(),
  failureCount: z.number(),
  timestamp: z.string(),
};

const fixtureTools = [
  tool("fx_list_entities"),
  tool("fx_get_entity"),
  tool("fx_create_entity"),
  tool("fx_update_entity"),
  tool("fx_remove_entity"),
  tool("fx_bulk_update_status", bulkOutput),
  tool("fx_adjust_bids"),
  tool("fx_validate_entity"),
  tool("fx_upload_image"),
];

describe("describeSchemaSizeGuard", () => {
  describeSchemaSizeGuard(fixtureTools);
});

describe("describeCrossServerContract", () => {
  describeCrossServerContract({
    tools: fixtureTools,
    prefix: "fx_",
    requiredTools: [...ENTITY_CRUD_TOOLS],
    destructiveTools: ["upload_image"],
  });
});

describe("describeCrossServerContract, updated/created bulk shape", () => {
  describeCrossServerContract({
    tools: [
      tool("fx_bulk_update_entities", {
        results: z.array(z.unknown()),
        updated: z.number(),
        failed: z.number(),
      }),
    ],
    prefix: "fx_",
    requiredTools: ["bulk_update_entities"],
    bulkOutputShape: "updated-or-created",
  });
});

describe("describeCrossServerContract, exempt bulk tool", () => {
  describeCrossServerContract({
    tools: [
      tool("fx_bulk_create_entities", { results: z.array(z.unknown()), totalItems: z.number() }),
    ],
    prefix: "fx_",
    requiredTools: ["bulk_create_entities"],
    bulkOutputExemptTools: ["bulk_create_entities"],
  });
});

function repoRegistry(): { protocol_version: string; servers: Array<Record<string, any>> } {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (!existsSync(resolve(dir, "registry.json"))) dir = dirname(dir);
  return JSON.parse(readFileSync(resolve(dir, "registry.json"), "utf8"));
}

/** A stand-in for a server's `createMcpHttpServer` that serves the card the registry describes. */
function fakeServerFactory(received: unknown[]) {
  const registry = repoRegistry();
  return (config: { serviceName: string; mcpAuthMode: string }) => {
    received.push(config);
    const entry = registry.servers.find((s) => s.package === config.serviceName)!;
    return {
      app: {
        request: async () =>
          new Response(
            JSON.stringify({
              name: entry.package,
              title: entry.title,
              auth: { current_mode: config.mcpAuthMode, supported_modes: entry.auth.modes },
              description: entry.runtime_description,
              platform: entry.platform,
              documentation_url: entry.documentation_url,
              mcp_protocol_versions: [registry.protocol_version],
              transports: [{ type: "streamable_http", endpoint: "/mcp" }],
              operational: { rollback: { terminalOperations: [{ tool: "dv360_update_entity" }] } },
            }),
            { status: 200 }
          ),
      },
      shutdown: () => undefined,
    };
  };
}

const received: Array<Record<string, unknown>> = [];
const serverCard = {
  packageName: "dv360-mcp",
  createServer: fakeServerFactory(received),
  platformConfig: { port: 3002, dv360ApiBaseUrl: "https://example.test" },
  terminalTools: ["dv360_update_entity"],
};

describe("describeServerCard", () => {
  describeServerCard(serverCard);
});

describe("readServerCard", () => {
  it("builds the server config from the registry entry, the platform config and overrides", async () => {
    received.length = 0;
    await readServerCard(serverCard, { mcpAuthMode: "jwt" });
    expect(received).toEqual([
      {
        serviceName: "dv360-mcp",
        host: "127.0.0.1",
        nodeEnv: "test",
        mcpStatefulSessionTimeoutMs: 60_000,
        mcpAuthMode: "jwt",
        mcpAllowedOrigins: "*",
        port: 3002,
        dv360ApiBaseUrl: "https://example.test",
      },
    ]);
  });

  it("rejects a package that is not in registry.json", async () => {
    await expect(readServerCard({ ...serverCard, packageName: "nope-mcp" })).rejects.toThrow(
      "nope-mcp is not in registry.json"
    );
  });
});

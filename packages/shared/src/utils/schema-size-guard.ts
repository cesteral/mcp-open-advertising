// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Schema-size guard helper for MCP tool registries.
 *
 * Stdio transport caps a single message at ~1 MB; in practice we keep
 * individual tool inputSchemas well under 256 KB so that combined
 * `tools/list` responses stay healthy across all 13 servers.
 *
 * Usage from a per-server vitest test:
 *
 * ```ts
 * import { describe, it } from "vitest";
 * import { allTools } from "../src/mcp-server/tools/definitions/index.js";
 * import { assertSchemaSizesUnderLimit } from "@cesteral/shared";
 *
 * describe("schema size guard", () => {
 *   it("each tool inputSchema stays under 256 KB", () => {
 *     assertSchemaSizesUnderLimit(allTools);
 *   });
 * });
 * ```
 */

import { zodToJsonSchema } from "zod-to-json-schema";
import type { ZodTypeAny } from "zod";

export interface SchemaSizeGuardTool {
  name: string;
  inputSchema: ZodTypeAny;
}

export interface SchemaSizeGuardOptions {
  /** Per-tool hard fail threshold in bytes. Default 256 KB. */
  perToolLimitBytes?: number;
  /** Aggregate `tools/list` payload hard fail in bytes. Default 1 MB. */
  totalLimitBytes?: number;
}

export interface SchemaSizeReport {
  perTool: Array<{ name: string; sizeBytes: number }>;
  totalBytes: number;
}

const DEFAULT_PER_TOOL_LIMIT = 256 * 1024;
const DEFAULT_TOTAL_LIMIT = 1_000_000;

/**
 * Compute serialized inputSchema sizes for a server's tool registry without
 * asserting. Useful for reporting / debugging.
 */
export function measureSchemaSizes(tools: SchemaSizeGuardTool[]): SchemaSizeReport {
  const perTool: SchemaSizeReport["perTool"] = [];
  let totalBytes = 0;

  for (const tool of tools) {
    const json = JSON.stringify(zodToJsonSchema(tool.inputSchema));
    const sizeBytes = Buffer.byteLength(json, "utf-8");
    perTool.push({ name: tool.name, sizeBytes });
    totalBytes += sizeBytes;
  }

  return { perTool, totalBytes };
}

/**
 * Throw an Error listing every offending tool whose serialized inputSchema
 * exceeds the per-tool limit, or whose combined size exceeds the aggregate
 * stdio safety limit.
 */
export function assertSchemaSizesUnderLimit(
  tools: SchemaSizeGuardTool[],
  options: SchemaSizeGuardOptions = {}
): SchemaSizeReport {
  const perToolLimit = options.perToolLimitBytes ?? DEFAULT_PER_TOOL_LIMIT;
  const totalLimit = options.totalLimitBytes ?? DEFAULT_TOTAL_LIMIT;

  const report = measureSchemaSizes(tools);
  const violations: string[] = [];

  for (const entry of report.perTool) {
    if (entry.sizeBytes > perToolLimit) {
      violations.push(
        `  - ${entry.name}: ${(entry.sizeBytes / 1024).toFixed(2)} KB ` +
          `(limit ${(perToolLimit / 1024).toFixed(0)} KB)`
      );
    }
  }

  if (report.totalBytes > totalLimit) {
    violations.push(
      `  - <total>: ${(report.totalBytes / 1024).toFixed(2)} KB ` +
        `(limit ${(totalLimit / 1024).toFixed(0)} KB)`
    );
  }

  if (violations.length > 0) {
    throw new Error(
      `Schema size guard failed:\n${violations.join("\n")}\n\n` +
        `Move enum bloat to MCP Resources (see docs/CROSS_SERVER_CONTRACT.md ` +
        `"Description Convention for Enum-Keyed Fields").`
    );
  }

  return report;
}

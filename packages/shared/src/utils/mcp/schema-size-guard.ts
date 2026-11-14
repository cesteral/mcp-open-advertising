// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Schema-size guard helper for MCP tool registries.
 *
 * Stdio transport caps a single message at ~1 MB; in practice we keep
 * individual tool inputSchemas well under 256 KB so that combined
 * `tools/list` responses stay healthy across all 13 servers. Each tool's
 * `outputSchema` is published in the same response and is guarded separately.
 *
 * Usage from a per-server vitest test:
 *
 * ```ts
 * import { describe, it } from "vitest";
 * import { allTools } from "../../src/mcp-server/tools/definitions/index.js";
 * import { assertSchemaSizesUnderLimit } from "@cesteral/shared";
 *
 * describe("schema size guard", () => {
 *   it("each tool inputSchema stays under 256 KB", () => {
 *     assertSchemaSizesUnderLimit(allTools);
 *   });
 * });
 * ```
 */

import { toJSONSchema, type ZodTypeAny } from "zod";

export interface SchemaSizeGuardTool {
  name: string;
  inputSchema: ZodTypeAny;
  /** Published with `tools/list` alongside `inputSchema`, so it is guarded too. */
  outputSchema?: ZodTypeAny;
}

export interface SchemaSizeGuardOptions {
  /** Per-tool hard fail threshold in bytes. Default 256 KB. */
  perToolLimitBytes?: number;
  /** Aggregate `tools/list` payload hard fail in bytes. Default 1 MB. */
  totalLimitBytes?: number;
  /** Per-tool `outputSchema` hard fail threshold in bytes. Default 16 KB. */
  perToolOutputLimitBytes?: number;
  /** Aggregate `outputSchema` hard fail in bytes for one server. Default 128 KB. */
  totalOutputLimitBytes?: number;
}

export interface SchemaSizeReport {
  perTool: Array<{ name: string; sizeBytes: number }>;
  totalBytes: number;
  /** Tools that publish an `outputSchema`, with its serialized size. */
  perToolOutput: Array<{ name: string; sizeBytes: number }>;
  totalOutputBytes: number;
}

const DEFAULT_PER_TOOL_LIMIT = 256 * 1024;
const DEFAULT_TOTAL_LIMIT = 1_000_000;
// `outputSchema` is published in `tools/list` next to `inputSchema` and is the
// larger half of it fleet-wide, but nothing bounded it: a generated vendor
// response schema (e.g. a full forecast or report envelope) can add tens of KB
// to a single tool and every client pays that on every `tools/list`. Limits
// are set from measured sizes of the real tools (zod's toJSONSchema, as below):
// the largest single outputSchema in the fleet is 4.9 KB (amazon_dsp_update_
// commitment) and the largest per-server total is 88 KB (ttd, 46 tools; the
// fleet totals 617 KB), so 16 KB / 128 KB leave ~3x / ~1.5x headroom. The
// amazon_dsp_get_campaign_forecast schema was ~50 KB before it was slimmed and
// would have failed the per-tool limit.
const DEFAULT_PER_TOOL_OUTPUT_LIMIT = 16 * 1024;
const DEFAULT_TOTAL_OUTPUT_LIMIT = 128 * 1024;

function serializedBytes(schema: ZodTypeAny): number {
  return Buffer.byteLength(
    JSON.stringify(toJSONSchema(schema, { target: "draft-7", unrepresentable: "any" })),
    "utf-8"
  );
}

/**
 * Compute serialized inputSchema sizes for a server's tool registry without
 * asserting. Useful for reporting / debugging.
 */
export function measureSchemaSizes(tools: SchemaSizeGuardTool[]): SchemaSizeReport {
  const perTool: SchemaSizeReport["perTool"] = [];
  const perToolOutput: SchemaSizeReport["perToolOutput"] = [];
  let totalBytes = 0;
  let totalOutputBytes = 0;

  for (const tool of tools) {
    const sizeBytes = serializedBytes(tool.inputSchema);
    perTool.push({ name: tool.name, sizeBytes });
    totalBytes += sizeBytes;

    if (tool.outputSchema) {
      const outputBytes = serializedBytes(tool.outputSchema);
      perToolOutput.push({ name: tool.name, sizeBytes: outputBytes });
      totalOutputBytes += outputBytes;
    }
  }

  return { perTool, totalBytes, perToolOutput, totalOutputBytes };
}

/**
 * Throw an Error listing every offending tool whose serialized inputSchema or
 * outputSchema exceeds its per-tool limit, or whose combined size exceeds the
 * aggregate limit.
 */
export function assertSchemaSizesUnderLimit(
  tools: SchemaSizeGuardTool[],
  options: SchemaSizeGuardOptions = {}
): SchemaSizeReport {
  const perToolLimit = options.perToolLimitBytes ?? DEFAULT_PER_TOOL_LIMIT;
  const totalLimit = options.totalLimitBytes ?? DEFAULT_TOTAL_LIMIT;
  const perToolOutputLimit = options.perToolOutputLimitBytes ?? DEFAULT_PER_TOOL_OUTPUT_LIMIT;
  const totalOutputLimit = options.totalOutputLimitBytes ?? DEFAULT_TOTAL_OUTPUT_LIMIT;

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

  for (const entry of report.perToolOutput) {
    if (entry.sizeBytes > perToolOutputLimit) {
      violations.push(
        `  - ${entry.name} (outputSchema): ${(entry.sizeBytes / 1024).toFixed(2)} KB ` +
          `(limit ${(perToolOutputLimit / 1024).toFixed(0)} KB)`
      );
    }
  }

  if (report.totalOutputBytes > totalOutputLimit) {
    violations.push(
      `  - <total outputSchema>: ${(report.totalOutputBytes / 1024).toFixed(2)} KB ` +
        `(limit ${(totalOutputLimit / 1024).toFixed(0)} KB)`
    );
  }

  if (violations.length > 0) {
    throw new Error(
      `Schema size guard failed:\n${violations.join("\n")}\n\n` +
        `Move enum bloat to MCP Resources (see docs/CROSS_SERVER_CONTRACT.md ` +
        `"Description Convention for Enum-Keyed Fields"). For an outputSchema, ` +
        `publish a compact schema of the fields the tool returns and let the rest ` +
        `pass through (.passthrough()) instead of embedding a generated vendor schema.`
    );
  }

  return report;
}

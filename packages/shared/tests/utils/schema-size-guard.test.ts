// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  assertSchemaSizesUnderLimit,
  measureSchemaSizes,
} from "../../src/utils/mcp/schema-size-guard.js";

const smallInput = z.object({ id: z.string() });

/** An object schema whose serialized JSON is a little over `approxBytes`. */
function bloatedSchema(approxBytes: number) {
  const shape: Record<string, z.ZodTypeAny> = {};
  const fieldBytes = 40; // `"field_0001":{"type":"string"},` is ~32 bytes
  for (let i = 0; i < Math.ceil(approxBytes / fieldBytes); i++) {
    shape[`field_${String(i).padStart(5, "0")}`] = z.string().optional();
  }
  return z.object(shape);
}

describe("schema size guard: outputSchema", () => {
  it("measures outputSchema separately from inputSchema", () => {
    const report = measureSchemaSizes([
      { name: "with_output", inputSchema: smallInput, outputSchema: z.object({ ok: z.boolean() }) },
      { name: "no_output", inputSchema: smallInput },
    ]);
    expect(report.perTool).toHaveLength(2);
    expect(report.perToolOutput.map((t) => t.name)).toEqual(["with_output"]);
    expect(report.totalOutputBytes).toBe(report.perToolOutput[0]!.sizeBytes);
  });

  it("passes when every outputSchema is under the limits", () => {
    expect(() =>
      assertSchemaSizesUnderLimit([
        { name: "t", inputSchema: smallInput, outputSchema: z.object({ ok: z.boolean() }) },
      ])
    ).not.toThrow();
  });

  it("fails and names a tool whose outputSchema exceeds the per-tool limit", () => {
    expect(() =>
      assertSchemaSizesUnderLimit(
        [
          { name: "huge_output", inputSchema: smallInput, outputSchema: bloatedSchema(40 * 1024) },
          { name: "fine", inputSchema: smallInput, outputSchema: z.object({ ok: z.boolean() }) },
        ],
        { totalOutputLimitBytes: 10 * 1024 * 1024 }
      )
    ).toThrow(/huge_output \(outputSchema\)/);
  });

  it("does not blame a tool whose outputSchema is within the limit", () => {
    try {
      assertSchemaSizesUnderLimit([
        { name: "huge_output", inputSchema: smallInput, outputSchema: bloatedSchema(40 * 1024) },
        { name: "fine", inputSchema: smallInput, outputSchema: z.object({ ok: z.boolean() }) },
      ]);
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).not.toMatch(/fine \(outputSchema\)/);
    }
  });

  it("fails when the aggregate outputSchema size exceeds the total limit", () => {
    const tools = Array.from({ length: 5 }, (_, i) => ({
      name: `t${i}`,
      inputSchema: smallInput,
      outputSchema: bloatedSchema(10 * 1024),
    }));
    expect(() => assertSchemaSizesUnderLimit(tools)).not.toThrow();
    expect(() => assertSchemaSizesUnderLimit(tools, { totalOutputLimitBytes: 20 * 1024 })).toThrow(
      /<total outputSchema>/
    );
  });

  it("still enforces the inputSchema limit", () => {
    expect(() =>
      assertSchemaSizesUnderLimit([{ name: "big_in", inputSchema: bloatedSchema(2 * 1024) }], {
        perToolLimitBytes: 1024,
      })
    ).toThrow(/big_in: /);
  });
});

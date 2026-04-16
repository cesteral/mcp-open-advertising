// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, expect, it } from "vitest";
import {
  GetAvailableMetricsInputSchema,
  GetAvailableMetricsOutputSchema,
  getAvailableMetricsLogic,
  getAvailableMetricsResponseFormatter,
  getAvailableMetricsTool,
} from "../../src/mcp-server/tools/definitions/get-available-metrics.tool.js";

describe("meta_get_available_metrics", () => {
  it("exposes the canonical tool metadata", () => {
    expect(getAvailableMetricsTool.name).toBe("meta_get_available_metrics");
    expect(getAvailableMetricsTool.annotations.readOnlyHint).toBe(true);
  });

  it("accepts empty input", () => {
    const parsed = GetAvailableMetricsInputSchema.safeParse({});
    expect(parsed.success).toBe(true);
  });

  it("accepts a level scope", () => {
    const parsed = GetAvailableMetricsInputSchema.safeParse({ level: "ad" });
    expect(parsed.success).toBe(true);
  });

  it("rejects an unknown level", () => {
    const parsed = GetAvailableMetricsInputSchema.safeParse({ level: "bogus" });
    expect(parsed.success).toBe(false);
  });

  it("returns non-empty metric groups, breakdowns, and action breakdowns", async () => {
    const result = await getAvailableMetricsLogic(
      {},
      { requestId: "req-1" } as any,
    );

    expect(result.level).toBeNull();
    expect(Object.keys(result.metrics)).toContain("delivery");
    expect(Object.keys(result.metrics)).toContain("conversions");
    expect(result.metrics.delivery).toContain("impressions");
    expect(result.metrics.conversions).toContain("purchase_roas");
    expect(result.breakdowns).toContain("age");
    expect(result.breakdowns).toContain("country");
    expect(result.actionBreakdowns).toContain("action_type");
    expect(result.notes.length).toBeGreaterThan(0);
    expect(result.timestamp).toBeDefined();

    // Output must validate against its schema
    expect(() => GetAvailableMetricsOutputSchema.parse(result)).not.toThrow();
  });

  it("echoes the requested level in the output", async () => {
    const result = await getAvailableMetricsLogic(
      { level: "campaign" },
      { requestId: "req-2" } as any,
    );
    expect(result.level).toBe("campaign");
  });

  it("response formatter renders metric groups and breakdowns", async () => {
    const result = await getAvailableMetricsLogic(
      { level: "adset" },
      { requestId: "req-3" } as any,
    );
    const content = getAvailableMetricsResponseFormatter(result);
    expect(content).toHaveLength(1);
    expect(content[0]!.text).toContain("delivery");
    expect(content[0]!.text).toContain("impressions");
    expect(content[0]!.text).toContain("Breakdowns");
    expect(content[0]!.text).toContain("Action breakdowns");
    expect(content[0]!.text).toContain("adset");
  });
});

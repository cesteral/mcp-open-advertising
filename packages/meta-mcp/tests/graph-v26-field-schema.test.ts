// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Every field name meta-mcp sends on its own initiative must exist on its
 * node in Graph/Marketing API v26.0 (#229).
 *
 * Graph rejects a request that names a field its node does not have with
 * (#100) "Tried accessing nonexisting field", so one stale name in a default
 * field list breaks every read that relies on the default — not just the one
 * field. The lists below are hard-coded and only a live call would otherwise
 * notice a stale entry, so they are checked against the field lists in Meta's
 * own generated API specs, vendored in `fixtures/graph-v26-spec.json` with the
 * commit they were read from (platform-facts `meta.graph_v26_field_schema`).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import catalog from "../src/config/insights-catalog.json" with { type: "json" };
import { MetaInsightsService } from "../src/services/meta/meta-insights-service.js";
import { MetaService } from "../src/services/meta/meta-service.js";
import {
  getEntityConfig,
  getSupportedEntityTypes,
  type MetaEntityType,
} from "../src/mcp-server/tools/utils/entity-mapping.js";

interface SpecFixture {
  source: { repository: string; commit: string; apiVersion: string };
  fields: Record<string, string[]>;
  enums: Record<string, string[]>;
}

const spec = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "fixtures/graph-v26-spec.json"),
    "utf-8"
  )
) as SpecFixture;

const NODE_FOR_ENTITY: Record<MetaEntityType, string> = {
  campaign: "Campaign",
  adSet: "AdSet",
  ad: "Ad",
  adCreative: "AdCreative",
  customAudience: "CustomAudience",
};

function unknownFields(node: string, fields: readonly string[]): string[] {
  const known = new Set(spec.fields[node]);
  expect(known.size, `fixture has no field list for ${node}`).toBeGreaterThan(0);
  return fields.filter((f) => !known.has(f));
}

function stubs() {
  const httpClient = {
    get: vi.fn().mockResolvedValue({ data: [] }),
    post: vi.fn().mockResolvedValue({ report_run_id: "1" }),
    delete: vi.fn(),
  } as any;
  const rateLimiter = { consume: vi.fn().mockResolvedValue(undefined) } as any;
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any;
  return { httpClient, rateLimiter, logger };
}

describe("Graph v26 field schema (#229)", () => {
  it("is read from Meta's v26.0 specs", () => {
    expect(spec.source.repository).toBe("facebook/facebook-business-sdk-codegen");
    expect(spec.source.apiVersion).toBe("v26.0");
    expect(spec.source.commit).toMatch(/^[0-9a-f]{40}$/);
  });

  it("covers every entity type meta-mcp reads", () => {
    expect(Object.keys(NODE_FOR_ENTITY).sort()).toEqual([...getSupportedEntityTypes()].sort());
  });

  it.each(Object.entries(NODE_FOR_ENTITY) as [MetaEntityType, string][])(
    "%s default fields all exist on %s",
    (entityType, node) => {
      expect(unknownFields(node, getEntityConfig(entityType).defaultFields)).toEqual([]);
    }
  );

  it("customAudience reads the audience-size bounds, not the removed approximate_count", () => {
    // approximate_count left the CustomAudience spec at v13.0 (codegen
    // 2c2c48483d5b33e2759aca68d7ed92dc9b1775ea); only the two bounds remain.
    const fields = getEntityConfig("customAudience").defaultFields;
    expect(fields).not.toContain("approximate_count");
    expect(fields).toEqual(
      expect.arrayContaining(["approximate_count_lower_bound", "approximate_count_upper_bound"])
    );
  });

  it("meta_list_ad_accounts default fields all exist on AdAccount", async () => {
    const { httpClient, rateLimiter, logger } = stubs();
    await new MetaService(rateLimiter, httpClient, logger).listAdAccounts();
    const [path, params] = httpClient.get.mock.calls[0];
    expect(path).toBe("/me/adaccounts");
    expect(unknownFields("AdAccount", params.fields.split(","))).toEqual([]);
  });

  it("insights default fields all exist on AdsInsights (sync, async and breakdowns)", async () => {
    const { httpClient, rateLimiter, logger } = stubs();
    const insights = new MetaInsightsService(rateLimiter, httpClient, logger);
    await insights.getInsights("act_1", { datePreset: "last_7d" });
    await insights.submitInsightsReport("act_1", { datePreset: "last_7d" });
    await insights.getInsightsBreakdowns("act_1", { breakdowns: ["age"], datePreset: "last_7d" });

    const sent = [
      httpClient.get.mock.calls[0][1].fields,
      httpClient.post.mock.calls[0][1].fields,
      httpClient.get.mock.calls[1][1].fields,
    ];
    for (const fields of sent) {
      expect(typeof fields).toBe("string");
      expect(unknownFields("AdsInsights", fields.split(","))).toEqual([]);
    }
  });

  it("the insights catalog names only v26 AdsInsights fields and breakdowns", () => {
    const metrics = Object.values(catalog.metrics as Record<string, string[]>).flat();
    expect(unknownFields("AdsInsights", metrics)).toEqual([]);

    const breakdowns = new Set(spec.enums.adaccountinsights_breakdowns_enum_param);
    expect(catalog.breakdowns.filter((b: string) => !breakdowns.has(b))).toEqual([]);

    const actionBreakdowns = new Set(spec.enums.adaccountinsights_action_breakdowns_enum_param);
    expect(catalog.actionBreakdowns.filter((b: string) => !actionBreakdowns.has(b))).toEqual([]);
  });
});

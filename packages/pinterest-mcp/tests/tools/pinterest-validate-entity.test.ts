// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * pinterest_validate_entity used TikTok's rules (#235, review finding
 * pinterest #8): it required `campaign_name` / `budget_mode` / `budget`, so it
 * rejected every correct Pinterest payload and accepted TikTok ones. These
 * tests pin the Pinterest v5 OpenAPI rules in `pinterest-fields.ts`, and check
 * that every write tool's own `inputExamples` pass them.
 */

import { describe, it, expect } from "vitest";
import { validateEntityLogic } from "../../src/mcp-server/tools/definitions/validate-entity.tool.js";
import { createEntityTool } from "../../src/mcp-server/tools/definitions/create-entity.tool.js";
import { bulkCreateEntitiesTool } from "../../src/mcp-server/tools/definitions/bulk-create-entities.tool.js";
import { updateEntityTool } from "../../src/mcp-server/tools/definitions/update-entity.tool.js";
import { bulkUpdateEntitiesTool } from "../../src/mcp-server/tools/definitions/bulk-update-entities.tool.js";
import { validateEntityTool } from "../../src/mcp-server/tools/definitions/validate-entity.tool.js";
import {
  OBJECTIVE_TYPES,
  READ_ONLY_FIELDS,
} from "../../src/mcp-server/tools/utils/pinterest-fields.js";

type Mode = "create" | "update";
const ctx = { requestId: "test" } as any;

async function validate(entityType: string, mode: Mode, data: Record<string, unknown>) {
  return validateEntityLogic({ entityType, mode, data } as any, ctx);
}

const errors = (r: Awaited<ReturnType<typeof validate>>) =>
  r.issues.filter((i) => i.severity !== "warning").map((i) => i.field);
const warnings = (r: Awaited<ReturnType<typeof validate>>) =>
  r.issues.filter((i) => i.severity === "warning").map((i) => i.field);

const VALID_CREATES: Record<string, Record<string, unknown>> = {
  campaign: { name: "Spring", objective_type: "WEB_CONVERSION", status: "PAUSED" },
  adGroup: {
    name: "US women",
    campaign_id: "626736533506",
    billable_event: "CLICKTHROUGH",
    budget_in_micro_currency: 20000000,
    bid_strategy_type: "MAX_BID",
    bid_in_micro_currency: 500000,
    start_time: 1775001600,
    targeting_spec: { LOCATION: ["US"], GENDER: ["female"], MINIMUM_AGE: "25", MAXIMUM_AGE: "44" },
  },
  ad: { ad_group_id: "2680060704746", creative_type: "VIDEO", pin_id: "9876543210" },
  creative: {
    board_id: "549755885175",
    media_source: { source_type: "video_id", media_id: "123", cover_image_url: "https://x/c.jpg" },
  },
};

describe("create", () => {
  it.each(Object.entries(VALID_CREATES))("accepts a correct %s payload", async (type, data) => {
    const result = await validate(type, "create", data);
    expect(result.issues).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("rejects the TikTok-shaped campaign the tool used to require", async () => {
    const result = await validate("campaign", "create", {
      campaign_name: "Summer Sale 2026",
      objective_type: "TRAFFIC",
      budget_mode: "BUDGET_MODE_DAY",
      budget: 100,
    });
    expect(result.valid).toBe(false);
    expect(errors(result)).toEqual(expect.arrayContaining(["name", "objective_type"]));
    expect(result.issues.find((i) => i.code === "invalidValue")?.suggestedValues).toEqual([
      ...OBJECTIVE_TYPES,
    ]);
  });

  it.each([
    ["campaign", ["name", "objective_type"]],
    ["adGroup", ["name", "campaign_id", "billable_event"]],
    ["ad", ["ad_group_id", "creative_type", "pin_id"]],
  ])("%s requires %j", async (type, required) => {
    const result = await validate(type, "create", {});
    expect(errors(result).sort()).toEqual([...required].sort());
  });

  it("warns, but does not fail, on a Pin with no board_id or media_source (PinCreate requires nothing)", async () => {
    const result = await validate("creative", "create", { title: "t" });
    expect(result.valid).toBe(true);
    expect(warnings(result).sort()).toEqual(["board_id", "media_source"]);
  });
});

describe("field checks (both modes)", () => {
  it.each([
    ["a decimal", { budget_in_micro_currency: 50.5 }],
    ["a string", { budget_in_micro_currency: "50000000" }],
    ["a negative", { bid_in_micro_currency: -1 }],
  ])("rejects money given as %s", async (_label, data) => {
    const result = await validate("adGroup", "update", data);
    expect(result.valid).toBe(false);
  });

  it("warns when a budget looks like currency units rather than micros", async () => {
    const result = await validate("campaign", "update", { daily_spend_cap: 50 });
    expect(result.valid).toBe(true);
    expect(warnings(result)).toEqual(["daily_spend_cap"]);
  });

  it("does not apply the currency-unit warning to bids, which can be under 1.00", async () => {
    const result = await validate("adGroup", "update", { bid_in_micro_currency: 500000 });
    expect(result.issues).toEqual([]);
  });

  it.each([
    ["a date string", "2026-04-01 00:00:00"],
    ["milliseconds", 1775001600000],
  ])("rejects start_time given as %s", async (_label, value) => {
    const result = await validate("campaign", "update", { start_time: value });
    expect(errors(result)).toEqual(["start_time"]);
  });

  it("rejects lowercase targeting_spec keys and names the UPPERCASE one", async () => {
    const result = await validate("adGroup", "update", { targeting_spec: { gender: ["female"] } });
    expect(result.valid).toBe(false);
    expect(result.issues[0]).toMatchObject({
      field: "targeting_spec.gender",
      suggestedValues: ["GENDER"],
    });
  });

  it("warns on an unknown targeting_spec key and rejects a non-array value", async () => {
    const result = await validate("adGroup", "update", {
      targeting_spec: { HASHTAG: ["x"], LOCATION: "US" },
    });
    expect(warnings(result)).toEqual(["targeting_spec.HASHTAG"]);
    expect(errors(result)).toEqual(["targeting_spec.LOCATION"]);
  });

  it.each([
    [
      "an unknown source_type",
      { source_type: "video_url", url: "https://x" },
      "media_source.source_type",
    ],
    ["image_url without url", { source_type: "image_url" }, "media_source.url"],
    ["video_id without media_id", { source_type: "video_id" }, "media_source.media_id"],
  ])("rejects a Pin media_source with %s", async (_label, media_source, field) => {
    const result = await validate("creative", "update", { media_source });
    expect(errors(result)).toEqual([field]);
  });

  it("rejects an unknown optional enum value", async () => {
    const result = await validate("adGroup", "update", { bid_strategy_type: "TARGET_AVG_BID" });
    expect(errors(result)).toEqual(["bid_strategy_type"]);
  });

  it("rejects TikTok status values", async () => {
    const result = await validate("ad", "update", { status: "DISABLE" });
    expect(errors(result)).toEqual(["status"]);
  });
});

describe("update", () => {
  it("warns on read-only fields, including id", async () => {
    const result = await validate("ad", "update", {
      id: "1",
      review_status: "APPROVED",
      name: "x",
    });
    expect(result.valid).toBe(true);
    expect(warnings(result).sort()).toEqual(["id", "review_status"]);
  });

  it.each([
    ["campaign", "objective_type", "AWARENESS"],
    ["adGroup", "billable_event", "IMPRESSION"],
    ["ad", "pin_id", "123"],
  ])("warns that only a draft %s can change %s", async (type, field, value) => {
    const result = await validate(type, "update", { [field]: value });
    expect(result.valid).toBe(true);
    expect(warnings(result)).toEqual([field]);
  });

  it("rejects an empty update", async () => {
    expect((await validate("campaign", "update", {})).valid).toBe(false);
  });

  it("lists id as read-only for every entity type", () => {
    for (const fields of Object.values(READ_ONLY_FIELDS)) expect(fields).toContain("id");
  });
});

describe("the write tools' own inputExamples pass the validator", () => {
  const cases: Array<[string, string, Mode, Record<string, unknown>]> = [];
  for (const ex of createEntityTool.inputExamples) {
    const input = ex.input as { entityType: string; data: Record<string, unknown> };
    cases.push([`create_entity: ${ex.label}`, input.entityType, "create", input.data]);
  }
  for (const ex of bulkCreateEntitiesTool.inputExamples) {
    const input = ex.input as { entityType: string; items: Record<string, unknown>[] };
    input.items.forEach((item, i) =>
      cases.push([`bulk_create_entities: ${ex.label} [${i}]`, input.entityType, "create", item])
    );
  }
  for (const ex of updateEntityTool.inputExamples) {
    const input = ex.input as { entityType: string; data: Record<string, unknown> };
    cases.push([`update_entity: ${ex.label}`, input.entityType, "update", input.data]);
  }
  for (const ex of bulkUpdateEntitiesTool.inputExamples) {
    const input = ex.input as {
      entityType: string;
      items: Array<{ data: Record<string, unknown> }>;
    };
    input.items.forEach((item, i) =>
      cases.push([
        `bulk_update_entities: ${ex.label} [${i}]`,
        input.entityType,
        "update",
        item.data,
      ])
    );
  }
  const validExample = validateEntityTool.inputExamples.find((e) => e.label.startsWith("Valid"))!;
  const v = validExample.input as { entityType: string; mode: Mode; data: Record<string, unknown> };
  cases.push([`validate_entity: ${validExample.label}`, v.entityType, v.mode, v.data]);

  it("covers at least one example per write tool", () => {
    expect(cases.length).toBeGreaterThanOrEqual(8);
  });

  it.each(cases)("%s", async (_label, entityType, mode, data) => {
    const result = await validate(entityType, mode, data);
    expect(result.issues).toEqual([]);
  });
});

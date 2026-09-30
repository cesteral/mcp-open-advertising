// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, it, expect } from "vitest";
import { validateEntityLogic } from "../src/mcp-server/tools/definitions/validate-entity.tool.js";

const ctx = { requestId: "test" };

const validCampaign = {
  name: "Summer Sale",
  status: "PAUSED",
  objective_v2_properties: { objective_v2_type: "TRAFFIC" },
  daily_budget_micro: 20_000_000,
};

const validAdSquad = {
  campaign_id: "c1",
  name: "Squad",
  status: "PAUSED",
  type: "SNAP_ADS",
  placement_v2: { config: "AUTOMATIC", platforms: ["SNAPCHAT"] },
  optimization_goal: "IMPRESSIONS",
  targeting: { geos: [{ country_code: "us" }] },
  daily_budget_micro: 5_000_000,
};

describe("snapchat_validate_entity create fields (#233)", () => {
  it("accepts a campaign using objective_v2_properties", async () => {
    const result = await validateEntityLogic(
      { entityType: "campaign", mode: "create", data: validCampaign },
      ctx
    );
    expect(result.valid).toBe(true);
  });

  it("requires objective_v2_properties on campaign create", async () => {
    const { objective_v2_properties: _omit, ...data } = validCampaign;
    const result = await validateEntityLogic({ entityType: "campaign", mode: "create", data }, ctx);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.field === "objective_v2_properties")).toBe(true);
  });

  it("warns, but does not fail, when the legacy objective is also sent", async () => {
    const result = await validateEntityLogic(
      {
        entityType: "campaign",
        mode: "create",
        data: { ...validCampaign, objective: "WEB_CONVERSION" },
      },
      ctx
    );
    expect(result.valid).toBe(true);
    expect(result.issues.find((i) => i.field === "objective")?.severity).toBe("warning");
  });

  it("accepts a campaign that sends only the legacy objective, with warnings (Snap translates it)", async () => {
    const { objective_v2_properties: _omit, ...data } = validCampaign;
    const result = await validateEntityLogic(
      { entityType: "campaign", mode: "create", data: { ...data, objective: "WEB_CONVERSION" } },
      ctx
    );
    expect(result.valid).toBe(true);
    const severities = result.issues
      .filter((i) => i.field === "objective" || i.field === "objective_v2_properties")
      .map((i) => i.severity);
    expect(severities).toEqual(expect.arrayContaining(["warning"]));
    expect(severities).not.toContain("error");
  });

  it("accepts an ad squad using placement_v2", async () => {
    const result = await validateEntityLogic(
      { entityType: "adGroup", mode: "create", data: validAdSquad },
      ctx
    );
    expect(result.valid).toBe(true);
  });

  it("requires placement_v2 and rejects the legacy placement on ad squad create", async () => {
    const { placement_v2: _omit, ...rest } = validAdSquad;
    const result = await validateEntityLogic(
      { entityType: "adGroup", mode: "create", data: { ...rest, placement: "SNAP_ADS" } },
      ctx
    );
    expect(result.valid).toBe(false);
    const fields = result.issues.map((i) => i.field);
    expect(fields).toContain("placement_v2");
    expect(fields).toContain("placement");
  });
});

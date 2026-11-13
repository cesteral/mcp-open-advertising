// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NormalizedEntitySnapshotSchema } from "@cesteral/shared";

const { mockResolveSessionServices } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

import { getEntityLogic } from "../../src/mcp-server/tools/definitions/get-entity.tool.js";
import {
  buildGAdsSnapshot,
  campaignIdFromResourceName,
} from "../../src/mcp-server/tools/utils/capture-snapshot.js";

// basis: Google Ads API `AdGroup.campaign` is "the campaign to which the ad group
// belongs", a campaign resource name `customers/{customer_id}/campaigns/{campaign_id}`.
// A campaign snapshot carries the bare numeric id as `platformEntityId` (every
// gads_* tool takes the numeric id), so the ad group's parent id is that numeric id.
const adGroup = {
  id: "777",
  name: "Spring ad group",
  status: "ENABLED",
  campaign: "customers/1234567890/campaigns/456",
  resourceName: "customers/1234567890/adGroups/777",
};

describe("Google Ads snapshot parents", () => {
  it("names the campaign of an ad group by its numeric id, not its resource name", () => {
    const snapshot = buildGAdsSnapshot("adGroup", "1234567890", "777", adGroup, "USD");
    expect(snapshot?.parents).toEqual([{ kind: "campaign", id: "456" }]);
  });

  it("omits `parents` (not an empty list) when the ad group row names no campaign", () => {
    const { campaign: _omit, ...row } = adGroup;
    const snapshot = buildGAdsSnapshot("adGroup", "1234567890", "777", row, "USD");
    expect(snapshot).not.toBeNull();
    expect("parents" in (snapshot as object)).toBe(false);
  });

  it("omits `parents` when `campaign` is not a campaign resource name", () => {
    const snapshot = buildGAdsSnapshot(
      "adGroup",
      "1234567890",
      "777",
      { ...adGroup, campaign: "customers/1234567890/adGroups/9" },
      "USD"
    );
    expect("parents" in (snapshot as object)).toBe(false);
  });

  it("gives a campaign and a budget no parents", () => {
    const campaign = buildGAdsSnapshot(
      "campaign",
      "1234567890",
      "456",
      { id: "456", name: "Spring", status: "PAUSED" },
      "USD"
    );
    const budget = buildGAdsSnapshot(
      "campaignBudget",
      "1234567890",
      "5",
      { id: "5", name: "B", amountMicros: "5000000" },
      "USD"
    );
    expect("parents" in (campaign as object)).toBe(false);
    expect("parents" in (budget as object)).toBe(false);
  });

  it("takes the campaign from a create payload (a dry-run create has no read-back)", () => {
    const snapshot = buildGAdsSnapshot(
      "adGroup",
      "1234567890",
      "",
      { name: "New", campaign: "customers/1234567890/campaigns/456" },
      "USD"
    );
    expect(snapshot?.parents).toEqual([{ kind: "campaign", id: "456" }]);
  });

  it("extracts only the numeric id from a campaign resource name", () => {
    expect(campaignIdFromResourceName("customers/1/campaigns/2")).toBe("2");
    expect(campaignIdFromResourceName("customers/1/campaigns/")).toBeUndefined();
    expect(campaignIdFromResourceName("456")).toBeUndefined();
    expect(campaignIdFromResourceName(undefined)).toBeUndefined();
  });
});

describe("gads_get_entity as a governance read partner", () => {
  beforeEach(() => {
    mockResolveSessionServices.mockReset();
  });

  const call = (entityType: string, entityId: string) =>
    getEntityLogic(
      { entityType: entityType as never, customerId: "1234567890", entityId },
      { requestId: "r", timestamp: "t", operation: "test" } as never,
      { sessionId: "s" } as never
    );

  it("returns a snapshot at the top level, with parents, that the contract schema accepts", async () => {
    // The live search response nests the resource under its type key.
    mockResolveSessionServices.mockReturnValue({
      gadsService: {
        getEntity: vi.fn().mockResolvedValue({ adGroup }),
        getCustomerCurrency: vi.fn().mockResolvedValue("USD"),
      },
    });
    const result = await call("adGroup", "777");

    expect(result.entity).toEqual({ adGroup });
    expect(result.parents).toEqual([{ kind: "campaign", id: "456" }]);
    const parsed = NormalizedEntitySnapshotSchema.safeParse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.platformEntityId).toBe("777");
  });

  it("returns only entity + timestamp for an entity kind outside governance", async () => {
    mockResolveSessionServices.mockReturnValue({
      gadsService: {
        getEntity: vi.fn().mockResolvedValue({ keyword: { id: "1" } }),
        getCustomerCurrency: vi.fn(),
      },
    });
    const result = await call("keyword", "1");
    expect(Object.keys(result).sort()).toEqual(["entity", "timestamp"]);
  });
});

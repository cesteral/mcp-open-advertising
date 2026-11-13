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
import { buildMetaSnapshot } from "../../src/mcp-server/tools/utils/capture-snapshot.js";
import { getEntityConfig } from "../../src/mcp-server/tools/utils/entity-mapping.js";

// basis: Graph API Ad Set returns `campaign_id` ("the ID of the ad campaign this ad
// set belongs to"), but only when the field is requested.
const adSet = {
  id: "120000000001",
  name: "Spring ad set",
  status: "ACTIVE",
  campaign_id: "120000000000",
  daily_budget: "5000",
};

describe("Meta snapshot parents", () => {
  it("names the campaign of an ad set", () => {
    const snapshot = buildMetaSnapshot("adSet", "120000000001", adSet, {});
    expect(snapshot?.parents).toEqual([{ kind: "campaign", id: "120000000000" }]);
  });

  it("omits `parents` (not an empty list) when the read-back did not carry campaign_id", () => {
    const { campaign_id: _omit, ...row } = adSet;
    const snapshot = buildMetaSnapshot("adSet", "120000000001", row, {});
    expect(snapshot).not.toBeNull();
    expect("parents" in (snapshot as object)).toBe(false);
  });

  it("gives a campaign and an ad no parents", () => {
    const campaign = buildMetaSnapshot(
      "campaign",
      "120000000000",
      { id: "120000000000", name: "Spring", status: "ACTIVE" },
      {}
    );
    // An ad is not a level of the model; its `campaign_id` is not sent.
    const ad = buildMetaSnapshot(
      "ad",
      "9",
      { id: "9", name: "Ad", status: "ACTIVE", campaign_id: "120000000000" },
      {}
    );
    expect("parents" in (campaign as object)).toBe(false);
    expect("parents" in (ad as object)).toBe(false);
  });

  it("takes the campaign from a create payload (a dry-run create has no read-back)", () => {
    const snapshot = buildMetaSnapshot("adSet", "", {}, { name: "New", campaign_id: 120000000000 });
    expect(snapshot?.parents).toEqual([{ kind: "campaign", id: "120000000000" }]);
  });

  it("requests campaign_id when the governance read partner reads an ad set with default fields", () => {
    expect(getEntityConfig("adSet").defaultFields).toContain("campaign_id");
  });
});

describe("meta_get_entity as a governance read partner", () => {
  beforeEach(() => {
    mockResolveSessionServices.mockReset();
  });

  const call = (entityType: string, entityId: string) =>
    getEntityLogic(
      { entityType: entityType as never, entityId },
      { requestId: "r", timestamp: "t", operation: "test" } as never,
      { sessionId: "s" } as never
    );

  it("returns a snapshot at the top level, with parents, that the contract schema accepts", async () => {
    mockResolveSessionServices.mockReturnValue({
      metaService: { getEntity: vi.fn().mockResolvedValue(adSet) },
    });
    const result = await call("adSet", "120000000001");

    expect(result.entity).toEqual(adSet);
    expect(result.parents).toEqual([{ kind: "campaign", id: "120000000000" }]);
    expect(NormalizedEntitySnapshotSchema.safeParse(result).success).toBe(true);
  });

  it("returns only entity + timestamp for an entity kind outside governance", async () => {
    mockResolveSessionServices.mockReturnValue({
      metaService: { getEntity: vi.fn().mockResolvedValue({ id: "1", name: "Creative" }) },
    });
    const result = await call("adCreative", "1");
    expect(Object.keys(result).sort()).toEqual(["entity", "timestamp"]);
  });
});

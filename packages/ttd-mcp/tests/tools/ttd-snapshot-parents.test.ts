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
import { buildTtdSnapshot } from "../../src/mcp-server/tools/utils/capture-snapshot.js";

// basis: TTD REST `GET /adgroup/{id}` returns `CampaignId` (the parent campaign);
// `GET /campaign/{id}` has no ancestor but the advertiser (`AdvertiserId`).
const adGroupRow = {
  AdGroupId: "adg111aaa",
  AdGroupName: "Spring ad group",
  CampaignId: "camp456def",
  AdvertiserId: "adv123abc",
  Availability: "Available",
};

describe("TTD snapshot parents", () => {
  it("names the campaign of an ad group, in the campaign's own platformEntityId form", () => {
    const snapshot = buildTtdSnapshot("adGroup", "adg111aaa", adGroupRow, {});
    expect(snapshot?.parents).toEqual([{ kind: "campaign", id: "camp456def" }]);
  });

  it("omits `parents` (not an empty list) when the ad group row names no campaign", () => {
    const { CampaignId: _omit, ...row } = adGroupRow;
    const snapshot = buildTtdSnapshot("adGroup", "adg111aaa", row, {});
    expect(snapshot).not.toBeNull();
    expect("parents" in (snapshot as object)).toBe(false);
  });

  it("gives a campaign no parents (its ancestor is the advertiser, `accountId`)", () => {
    const snapshot = buildTtdSnapshot(
      "campaign",
      "camp456def",
      { CampaignId: "camp456def", CampaignName: "Spring", AdvertiserId: "adv123abc" },
      {}
    );
    expect("parents" in (snapshot as object)).toBe(false);
  });

  it("takes the campaign from a create payload (a dry-run create has no read-back)", () => {
    const snapshot = buildTtdSnapshot(
      "adGroup",
      "",
      {},
      {
        AdGroupName: "New",
        CampaignId: "camp456def",
      }
    );
    expect(snapshot?.parents).toEqual([{ kind: "campaign", id: "camp456def" }]);
  });
});

describe("ttd_get_entity as a governance read partner", () => {
  beforeEach(() => {
    mockResolveSessionServices.mockReset();
  });

  function withEntity(row: Record<string, unknown>) {
    mockResolveSessionServices.mockReturnValue({
      ttdService: { getEntity: vi.fn().mockResolvedValue(row) },
    });
  }
  const call = (entityType: string, entityId: string) =>
    getEntityLogic(
      { entityType: entityType as never, entityId },
      { requestId: "r", timestamp: "t", operation: "test" } as never,
      { sessionId: "s" } as never
    );

  it("returns a snapshot at the top level, with parents, that the contract schema accepts", async () => {
    withEntity(adGroupRow);
    const result = await call("adGroup", "adg111aaa");

    expect(result.entity).toEqual(adGroupRow);
    expect(result.parents).toEqual([{ kind: "campaign", id: "camp456def" }]);
    const parsed = NormalizedEntitySnapshotSchema.safeParse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.parents).toEqual([{ kind: "campaign", id: "camp456def" }]);
  });

  it("returns only entity + timestamp for an entity kind outside governance", async () => {
    withEntity({ AdvertiserId: "adv123abc", AdvertiserName: "Acme" });
    const result = await call("advertiser", "adv123abc");
    expect(Object.keys(result).sort()).toEqual(["entity", "timestamp"]);
  });
});

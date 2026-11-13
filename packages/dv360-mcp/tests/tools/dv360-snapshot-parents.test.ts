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
import { buildDv360Snapshot } from "../../src/mcp-server/tools/utils/capture-snapshot.js";

// basis: DV360 API v4 `LineItem.campaignId` and `LineItem.insertionOrderId` (the
// parents of a line item), and `InsertionOrder.campaignId`.
const lineItem = {
  name: "advertisers/1234567/lineItems/5678901",
  advertiserId: "1234567",
  campaignId: "9876543",
  insertionOrderId: "4445551",
  lineItemId: "5678901",
  displayName: "Spring LI",
  entityStatus: "ENTITY_STATUS_ACTIVE",
};
const insertionOrder = {
  name: "advertisers/1234567/insertionOrders/4445551",
  advertiserId: "1234567",
  campaignId: "9876543",
  insertionOrderId: "4445551",
  displayName: "Spring IO",
  entityStatus: "ENTITY_STATUS_ACTIVE",
};

describe("DV360 snapshot parents", () => {
  it("names the campaign and the insertion order of a line item", () => {
    const snapshot = buildDv360Snapshot(
      "lineItem",
      { advertiserId: "1234567", lineItemId: "5678901" },
      lineItem,
      lineItem,
      "USD"
    );
    expect(snapshot?.parents).toEqual([
      { kind: "campaign", id: "9876543" },
      { kind: "insertion_order", id: "4445551" },
    ]);
  });

  it("names the campaign of an insertion order", () => {
    const snapshot = buildDv360Snapshot(
      "insertionOrder",
      { advertiserId: "1234567", insertionOrderId: "4445551" },
      insertionOrder,
      insertionOrder,
      "USD"
    );
    expect(snapshot?.parents).toEqual([{ kind: "campaign", id: "9876543" }]);
  });

  it("names only the ancestors the read-back carries", () => {
    const { campaignId: _omit, ...row } = lineItem;
    const snapshot = buildDv360Snapshot(
      "lineItem",
      { advertiserId: "1234567", lineItemId: "5678901" },
      row,
      row,
      "USD"
    );
    expect(snapshot?.parents).toEqual([{ kind: "insertion_order", id: "4445551" }]);
  });

  it("omits `parents` (not an empty list) when the read-back names no ancestor", () => {
    const { campaignId: _c, insertionOrderId: _i, ...row } = lineItem;
    const snapshot = buildDv360Snapshot(
      "lineItem",
      { advertiserId: "1234567", lineItemId: "5678901" },
      row,
      row,
      "USD"
    );
    expect(snapshot).not.toBeNull();
    expect("parents" in (snapshot as object)).toBe(false);
  });

  it("gives a campaign no parents (its ancestor is the advertiser, `accountId`)", () => {
    const campaign = {
      advertiserId: "1234567",
      campaignId: "9876543",
      displayName: "Spring",
      entityStatus: "ENTITY_STATUS_ACTIVE",
    };
    const snapshot = buildDv360Snapshot(
      "campaign",
      { advertiserId: "1234567", campaignId: "9876543" },
      campaign,
      campaign,
      "USD"
    );
    expect("parents" in (snapshot as object)).toBe(false);
  });

  it("takes the ancestors from a create payload (a dry-run create has no read-back)", () => {
    const snapshot = buildDv360Snapshot(
      "lineItem",
      { advertiserId: "1234567" },
      {},
      { displayName: "New LI", insertionOrderId: "4445551", campaignId: "9876543" },
      "USD"
    );
    expect(snapshot?.parents).toEqual([
      { kind: "campaign", id: "9876543" },
      { kind: "insertion_order", id: "4445551" },
    ]);
  });
});

describe("dv360_get_entity as a governance read partner", () => {
  beforeEach(() => {
    mockResolveSessionServices.mockReset();
  });

  const call = (input: Record<string, unknown>) =>
    getEntityLogic(
      input as never,
      { requestId: "r", timestamp: "t", operation: "test" } as never,
      { sessionId: "s" } as never
    );

  it("returns a snapshot at the top level, with parents, that the contract schema accepts", async () => {
    mockResolveSessionServices.mockReturnValue({
      dv360Service: {
        getEntity: vi.fn().mockResolvedValue(lineItem),
        getAdvertiserCurrency: vi.fn().mockResolvedValue("USD"),
      },
    });
    const result = await call({
      entityType: "lineItem",
      advertiserId: "1234567",
      lineItemId: "5678901",
    });

    expect(result.entity).toEqual(lineItem);
    expect(result.platformEntityId).toBe("5678901");
    expect(result.parents).toEqual([
      { kind: "campaign", id: "9876543" },
      { kind: "insertion_order", id: "4445551" },
    ]);
    expect(NormalizedEntitySnapshotSchema.safeParse(result).success).toBe(true);
  });

  it("returns only entity + timestamp for an entity kind outside governance", async () => {
    mockResolveSessionServices.mockReturnValue({
      dv360Service: {
        getEntity: vi.fn().mockResolvedValue({ creativeId: "1", displayName: "C" }),
        getAdvertiserCurrency: vi.fn(),
      },
    });
    const result = await call({
      entityType: "creative",
      advertiserId: "1234567",
      creativeId: "1",
    });
    expect(Object.keys(result).sort()).toEqual(["entity", "timestamp"]);
  });
});

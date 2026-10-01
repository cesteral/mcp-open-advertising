// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Updates are PUT to the parent's collection route (`/v1/campaigns/{id}/adsquads`,
 * `/v1/adsquads/{id}/ads`, …) with the merged entity in the body, so the route
 * and the body's own parent field must name the same parent (fleet review
 * snapchat #16). The bulk path used to send every item to the first item's (or
 * the caller's) route, so an ad squad from another campaign went to the wrong one.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { McpError } from "@cesteral/shared";
import { SnapchatService } from "../../src/services/snapchat/snapchat-service.js";

const ACCOUNT = "acct_456";

const AD_SQUADS: Record<string, Record<string, unknown>> = {
  sq1: { id: "sq1", campaign_id: "camp_A", name: "One", status: "ACTIVE" },
  sq2: { id: "sq2", campaign_id: "camp_B", name: "Two", status: "ACTIVE" },
  sq3: { id: "sq3", campaign_id: "camp_A", name: "Three", status: "ACTIVE" },
};

const httpClient = {
  get: vi.fn(async (path: string) => {
    const squad = /^\/v1\/adsquads\/(\w+)$/.exec(path)?.[1];
    if (squad) {
      return {
        request_status: "SUCCESS",
        adsquads: [{ sub_request_status: "SUCCESS", adsquad: AD_SQUADS[squad] }],
      };
    }
    const campaign = /^\/v1\/campaigns\/(\w+)$/.exec(path)?.[1];
    if (campaign) {
      return {
        request_status: "SUCCESS",
        campaigns: [
          { sub_request_status: "SUCCESS", campaign: { id: campaign, ad_account_id: ACCOUNT } },
        ],
      };
    }
    throw new Error(`unexpected GET ${path}`);
  }),
  post: vi.fn(),
  put: vi.fn(async (_path: string, body: { adsquads: Array<{ id: string }> }) => ({
    request_status: "SUCCESS",
    adsquads: body.adsquads.map((s) => ({ sub_request_status: "SUCCESS", adsquad: s })),
  })),
  delete: vi.fn(),
};

const rateLimiter = { consume: vi.fn().mockResolvedValue(undefined) };

describe("SnapchatService update parent route (#16)", () => {
  let service: SnapchatService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SnapchatService(httpClient as any, "org_123", ACCOUNT, rateLimiter as any);
  });

  it("refuses a bulk batch whose ad squad belongs to another campaign, sending nothing", async () => {
    const err = await service
      .bulkUpdateEntities("adGroup", { adAccountId: ACCOUNT, campaignId: "camp_A" }, [
        { entityId: "sq1", data: { name: "x" } },
        { entityId: "sq2", data: { name: "y" } },
      ])
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(McpError);
    expect((err as McpError).message).toMatch(
      /sq2 belongs to campaign_id 'camp_B', not campaignId 'camp_A'/
    );
    expect(httpClient.put).not.toHaveBeenCalled();
  });

  it("sends one PUT per parent when the batch spans parents, results in input order", async () => {
    const result = await service.bulkUpdateEntities("adGroup", { adAccountId: ACCOUNT }, [
      { entityId: "sq1", data: { name: "x" } },
      { entityId: "sq2", data: { name: "y" } },
      { entityId: "sq3", data: { name: "z" } },
    ]);

    expect(httpClient.put).toHaveBeenCalledTimes(2);
    const calls = httpClient.put.mock.calls.map(([path, body]) => [
      path,
      (body as { adsquads: Array<{ id: string; campaign_id: string }> }).adsquads.map((s) => [
        s.id,
        s.campaign_id,
      ]),
    ]);
    expect(calls).toEqual([
      [
        "/v1/campaigns/camp_A/adsquads",
        [
          ["sq1", "camp_A"],
          ["sq3", "camp_A"],
        ],
      ],
      ["/v1/campaigns/camp_B/adsquads", [["sq2", "camp_B"]]],
    ]);
    expect(result.results.map((r) => [r.entityId, r.success])).toEqual([
      ["sq1", true],
      ["sq2", true],
      ["sq3", true],
    ]);
  });

  it("refuses a single update whose given parent is not the entity's own", async () => {
    await expect(
      service.updateEntity("adGroup", "sq2", { campaignId: "camp_A" }, { name: "y" })
    ).rejects.toThrow(/belongs to campaign_id 'camp_B'/);
    expect(httpClient.put).not.toHaveBeenCalled();
  });

  it("refuses a patch that moves the entity to another parent, sending nothing", async () => {
    // The route is the entity's own parent (camp_B); a body naming camp_A would
    // PUT one parent's entity into another's collection.
    await expect(
      service.updateEntity("adGroup", "sq2", { campaignId: "camp_B" }, { campaign_id: "camp_A" })
    ).rejects.toThrow(/cannot move it to another parent/);
    expect(httpClient.put).not.toHaveBeenCalled();
  });

  it("a matching parent filter still updates on that route", async () => {
    await service.updateEntity("adGroup", "sq2", { campaignId: "camp_B" }, { name: "y" });
    expect(httpClient.put).toHaveBeenCalledWith(
      "/v1/campaigns/camp_B/adsquads",
      expect.objectContaining({ adsquads: [expect.objectContaining({ id: "sq2", name: "y" })] }),
      undefined
    );
  });
});

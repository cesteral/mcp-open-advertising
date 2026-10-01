// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * `pinterest_list_entities` status filter on the wire (fleet review 2026-09,
 * pinterest #9). The real tool logic runs over real session services with only
 * `globalThis.fetch` stubbed.
 *
 * basis: Pinterest's OpenAPI description
 *   https://raw.githubusercontent.com/pinterest/api-description/main/v5/openapi.json
 *   (openapi 3.0.3, info.version 5.28.0, sha256
 *   b698c180678a616bf1d635b374c086ba9cb2484117035c12f2b906eebe92a3e5 — the copy
 *   `src/generated/types.ts` records). `campaigns/list`
 *   (GET /ad_accounts/{ad_account_id}/campaigns), `ad_groups/list` and
 *   `ads/list` take `components.parameters.query_entity_statuses`: an array of
 *   `EntityStatus` (ACTIVE | PAUSED | ARCHIVED | DRAFT | DELETED_DRAFT),
 *   default ["ACTIVE", "PAUSED"], declared with no `style` / `explode`, so
 *   OpenAPI 3's query default (`form`, `explode: true`) sends one
 *   `entity_statuses=` pair per value. `GET /pins` lists no such parameter.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  listEntitiesLogic,
  ListEntitiesInputSchema,
} from "../../src/mcp-server/tools/definitions/list-entities.tool.js";
import {
  installFetchStub,
  createWireSession,
  acceptingSdkContext,
  PINTEREST_HOST,
  AD_ACCOUNT_ID,
  type FetchStub,
  type WireRequest,
  type WireSession,
} from "../helpers/wire.js";

const ctx = { requestId: "wire-req" } as any;

let stub: FetchStub;
let session: WireSession;

beforeEach(async () => {
  stub = installFetchStub();
  session = await createWireSession();
});

afterEach(() => {
  session.dispose();
  stub.restore();
});

function listRequests(): WireRequest[] {
  return stub.to(PINTEREST_HOST).filter((r) => r.path !== "/v5/user_account");
}

async function list(input: Record<string, unknown>) {
  return listEntitiesLogic(
    ListEntitiesInputSchema.parse({ adAccountId: AD_ACCOUNT_ID, ...input }),
    ctx,
    acceptingSdkContext(session.sessionId)
  );
}

describe("pinterest_list_entities entityStatuses", () => {
  it("sends each requested status as its own entity_statuses pair", async () => {
    stub.route({
      method: "GET",
      host: PINTEREST_HOST,
      path: `/v5/ad_accounts/${AD_ACCOUNT_ID}/campaigns`,
      response: { items: [{ id: "1", status: "ARCHIVED" }], bookmark: null },
    });

    const result = await list({ entityType: "campaign", entityStatuses: ["ARCHIVED", "DRAFT"] });

    const [req] = listRequests();
    expect(listRequests()).toHaveLength(1);
    expect(req!.method).toBe("GET");
    expect(req!.path).toBe(`/v5/ad_accounts/${AD_ACCOUNT_ID}/campaigns`);
    expect(new URL(req!.url).searchParams.getAll("entity_statuses")).toEqual(["ARCHIVED", "DRAFT"]);
    expect(result.entities).toEqual([{ id: "1", status: "ARCHIVED" }]);
  });

  it("combines the status filter with the parent filter on ads", async () => {
    await list({
      entityType: "ad",
      adGroupId: "2680060704746",
      entityStatuses: ["ACTIVE", "PAUSED", "ARCHIVED"],
    });

    const [req] = listRequests();
    const params = new URL(req!.url).searchParams;
    expect(req!.path).toBe(`/v5/ad_accounts/${AD_ACCOUNT_ID}/ads`);
    expect(params.getAll("ad_group_ids")).toEqual(["2680060704746"]);
    expect(params.getAll("entity_statuses")).toEqual(["ACTIVE", "PAUSED", "ARCHIVED"]);
  });

  it("sends no entity_statuses when none is asked for (Pinterest's default applies)", async () => {
    await list({ entityType: "adGroup" });

    const [req] = listRequests();
    expect(new URL(req!.url).searchParams.has("entity_statuses")).toBe(false);
  });

  it("refuses a status filter on creatives before any request", async () => {
    await expect(list({ entityType: "creative", entityStatuses: ["ARCHIVED"] })).rejects.toThrow(
      /GET \/v5\/pins takes no status filter/
    );
    expect(listRequests()).toHaveLength(0);
  });

  it("accepts every EntityStatus value and nothing else", () => {
    for (const status of ["ACTIVE", "PAUSED", "ARCHIVED", "DRAFT", "DELETED_DRAFT"]) {
      expect(
        ListEntitiesInputSchema.safeParse({
          entityType: "campaign",
          adAccountId: AD_ACCOUNT_ID,
          entityStatuses: [status],
        }).success
      ).toBe(true);
    }
    expect(
      ListEntitiesInputSchema.safeParse({
        entityType: "campaign",
        adAccountId: AD_ACCOUNT_ID,
        entityStatuses: ["REMOVED"],
      }).success
    ).toBe(false);
    expect(
      ListEntitiesInputSchema.safeParse({
        entityType: "campaign",
        adAccountId: AD_ACCOUNT_ID,
        entityStatuses: [],
      }).success
    ).toBe(false);
  });
});

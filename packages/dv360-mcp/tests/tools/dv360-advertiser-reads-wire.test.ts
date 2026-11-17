// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Advertiser reads on the wire (#341). `dv360_list_entities` rejected every
 * advertiser that inherits its partner's SDF settings, and `dv360_get_entity`
 * required a `partnerId` and forwarded it to `advertisers.get`, which refuses
 * it ("Unknown name \"partnerId\": Cannot bind query parameter").
 *
 * Only `globalThis.fetch` is stubbed; the tool logic, DV360Service, the HTTP
 * client and the generated response schemas run as in production.
 *
 * basis: https://displayvideo.googleapis.com/$discovery/rest?version=v4
 *   (revision 20261117, fetched 2026-11-17)
 *   - resources.advertisers.methods.list: GET v4/advertisers, query `partnerId`
 *   - resources.advertisers.methods.get: GET v4/advertisers/{advertisersId},
 *     path parameter `advertiserId` only, no query parameters
 *   - schemas.SdfConfig.version: "Required. The version of SDF being used."
 *     That is the input rule for an overriding config; schemas.AdvertiserSdfConfig
 *     says `sdfConfig` is "Required when overridePartnerSdfConfig is true", and
 *     an inheriting advertiser is returned without a version.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  listEntitiesLogic,
  ListEntitiesInputSchema,
} from "../../src/mcp-server/tools/definitions/list-entities.tool.js";
import {
  getEntityLogic,
  GetEntityInputSchema,
} from "../../src/mcp-server/tools/definitions/get-entity.tool.js";
import {
  installFetchStub,
  createWireSession,
  DV360_HOST,
  type FetchStub,
  type WireSession,
} from "../helpers/wire.js";

const PARTNER = "7";
const ADV = "111";
const ctx = { requestId: "wire-req" } as any;

/** An advertiser that inherits the partner's SDF settings, as advertisers.get / list return it. */
const INHERITING_ADVERTISER = {
  name: `advertisers/${ADV}`,
  advertiserId: ADV,
  partnerId: PARTNER,
  displayName: "Inheriting Advertiser",
  entityStatus: "ENTITY_STATUS_ACTIVE",
  updateTime: "2026-11-01T00:00:00Z",
  adServerConfig: { thirdPartyOnlyConfig: {} },
  billingConfig: { billingProfileId: "55" },
  creativeConfig: {},
  generalConfig: { currencyCode: "EUR", domainUrl: "https://example.com", timeZone: "Etc/UTC" },
  dataAccessConfig: { sdfConfig: { sdfConfig: {} } },
};

let stub: FetchStub;
let session: WireSession;

beforeEach(async () => {
  stub = installFetchStub([
    { method: "GET", path: "/v4/advertisers", response: { advertisers: [INHERITING_ADVERTISER] } },
    { method: "GET", path: `/v4/advertisers/${ADV}`, response: INHERITING_ADVERTISER },
  ]);
  session = await createWireSession();
});

afterEach(() => {
  session.dispose();
  stub.restore();
});

describe("dv360_list_entities: advertiser", () => {
  it("parses an advertiser whose SDF config is inherited (no version)", async () => {
    const input = ListEntitiesInputSchema.parse({ entityType: "advertiser", partnerId: PARTNER });

    const result = await listEntitiesLogic(input, ctx, { sessionId: session.sessionId } as any);

    expect(result.entities).toHaveLength(1);
    expect(result.entities[0]).toMatchObject({ advertiserId: ADV });
    const [req] = stub.to(DV360_HOST);
    expect(req.method).toBe("GET");
    expect(req.path).toBe("/v4/advertisers");
    expect(req.query).toEqual({ partnerId: PARTNER });
  });
});

describe("dv360_get_entity: advertiser", () => {
  it("accepts an advertiser get without partnerId", () => {
    expect(
      GetEntityInputSchema.safeParse({ entityType: "advertiser", advertiserId: ADV }).success
    ).toBe(true);
  });

  it("still requires the advertiserId", () => {
    expect(GetEntityInputSchema.safeParse({ entityType: "advertiser" }).success).toBe(false);
  });

  it.each([
    ["without partnerId", { entityType: "advertiser", advertiserId: ADV }],
    ["with partnerId", { entityType: "advertiser", advertiserId: ADV, partnerId: PARTNER }],
  ])("GETs v4/advertisers/{id} with no query parameters, %s", async (_label, raw) => {
    const input = GetEntityInputSchema.parse(raw);

    const result = await getEntityLogic(input, ctx, { sessionId: session.sessionId } as any);

    expect(result.entity).toMatchObject({ advertiserId: ADV });
    const requests = stub.to(DV360_HOST);
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("GET");
    expect(requests[0].path).toBe(`/v4/advertisers/${ADV}`);
    expect(requests[0].query).toEqual({});
  });
});

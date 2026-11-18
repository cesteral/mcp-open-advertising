// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Insertion order reads on the wire. v4 Discovery describes
 * InsertionOrder.optimizationObjective as "Required.", which the generator turns
 * into a required enum; `dv360_get_entity` / `dv360_list_entities` parse the
 * response with the generated schema, so a required enum would reject every
 * insertion order returned without the field (the same failure as
 * SdfConfig.version for advertisers, #341). A REQUIRED_FIELDS_OVERRIDES entry in
 * convert-to-openapi.ts keeps it optional.
 *
 * Only `globalThis.fetch` is stubbed; the tool logic, DV360Service, the HTTP
 * client and the generated response schemas run as in production.
 *
 * basis: https://displayvideo.googleapis.com/$discovery/rest?version=v4
 *   (revision 20261117, fetched 2026-11-17)
 *   - resources.advertisers.resources.insertionOrders.methods.list:
 *     GET v4/advertisers/{advertiserId}/insertionOrders
 *   - resources.advertisers.resources.insertionOrders.methods.get:
 *     GET v4/advertisers/{advertiserId}/insertionOrders/{insertionOrderId}
 *   - schemas.InsertionOrder.optimizationObjective: "Required. The optimization
 *     objective of the insertion order." That is the create-time rule; the field
 *     is not marked outputOnly, and an insertion order created without an
 *     objective is not guaranteed to be returned with one.
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

const ADV = "111";
const IO = "222";
const ctx = { requestId: "wire-req" } as any;

/** An insertion order as the API returns it when no optimization objective is set. */
const IO_WITHOUT_OBJECTIVE = {
  name: `advertisers/${ADV}/insertionOrders/${IO}`,
  advertiserId: ADV,
  campaignId: "333",
  insertionOrderId: IO,
  displayName: "IO without objective",
  entityStatus: "ENTITY_STATUS_PAUSED",
  updateTime: "2026-11-01T00:00:00Z",
  pacing: {
    pacingPeriod: "PACING_PERIOD_DAILY",
    pacingType: "PACING_TYPE_EVEN",
    dailyMaxMicros: "1000000",
  },
  frequencyCap: { unlimited: true },
  kpi: { kpiType: "KPI_TYPE_CPM", kpiAmountMicros: "1000000" },
  budget: {
    budgetUnit: "BUDGET_UNIT_CURRENCY",
    budgetSegments: [
      {
        budgetAmountMicros: "100000000",
        dateRange: {
          startDate: { year: 2026, month: 11, day: 1 },
          endDate: { year: 2026, month: 12, day: 1 },
        },
      },
    ],
  },
  bidStrategy: { fixedBid: { bidAmountMicros: "1000000" } },
};

let stub: FetchStub;
let session: WireSession;

beforeEach(async () => {
  stub = installFetchStub([
    {
      method: "GET",
      path: `/v4/advertisers/${ADV}/insertionOrders`,
      response: { insertionOrders: [IO_WITHOUT_OBJECTIVE] },
    },
    {
      method: "GET",
      path: `/v4/advertisers/${ADV}/insertionOrders/${IO}`,
      response: IO_WITHOUT_OBJECTIVE,
    },
  ]);
  session = await createWireSession();
});

afterEach(() => {
  session.dispose();
  stub.restore();
});

describe("insertion order reads", () => {
  it("dv360_list_entities parses an insertion order without optimizationObjective", async () => {
    const input = ListEntitiesInputSchema.parse({
      entityType: "insertionOrder",
      advertiserId: ADV,
    });

    const result = await listEntitiesLogic(input, ctx, { sessionId: session.sessionId } as any);

    expect(result.entities).toHaveLength(1);
    expect(result.entities[0]).toMatchObject({ insertionOrderId: IO });
    const [req] = stub.to(DV360_HOST);
    expect(req.method).toBe("GET");
    expect(req.path).toBe(`/v4/advertisers/${ADV}/insertionOrders`);
  });

  it("dv360_get_entity parses an insertion order without optimizationObjective", async () => {
    const input = GetEntityInputSchema.parse({
      entityType: "insertionOrder",
      advertiserId: ADV,
      insertionOrderId: IO,
    });

    const result = await getEntityLogic(input, ctx, { sessionId: session.sessionId } as any);

    expect(result.entity).toMatchObject({ insertionOrderId: IO });
    const [req] = stub.to(DV360_HOST);
    expect(req.method).toBe("GET");
    expect(req.path).toBe(`/v4/advertisers/${ADV}/insertionOrders/${IO}`);
  });
});

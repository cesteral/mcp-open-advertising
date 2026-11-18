// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Insertion-order reads on the wire: an insertion order DV360 returns without
 * `optimizationObjective` must parse through `dv360_list_entities` and
 * `dv360_get_entity`.
 *
 * The weekly codegen-drift check (2026-11-17) found that live v4 Discovery
 * changed `InsertionOrder.optimizationObjective` from "Optional. Required. ..."
 * to "Required. ...". The generator marks a field required when its description
 * starts with "Required", and the same generated zod schema parses GET / list
 * responses, so the next regeneration would have rejected every IO returned
 * without the field (e.g. one created before the field existed), as
 * `SdfConfig.version` did for advertisers (#341). The
 * `REQUIRED_FIELDS_OVERRIDES.InsertionOrder` entry in
 * `scripts/lib/convert-to-openapi.ts` keeps it optional; this test fails if a
 * regeneration makes it required again.
 *
 * Only `globalThis.fetch` is stubbed; the tool logic, DV360Service, the HTTP
 * client and the generated response schemas run as in production.
 *
 * basis: https://displayvideo.googleapis.com/$discovery/rest?version=v4
 *   (revision 20261117, fetched 2026-11-17)
 *   - resources.advertisers.resources.insertionOrders.methods.list:
 *     GET v4/advertisers/{+advertiserId}/insertionOrders
 *   - resources.advertisers.resources.insertionOrders.methods.get:
 *     GET v4/advertisers/{+advertiserId}/insertionOrders/{+insertionOrderId}
 *   - resources.advertisers.methods.get: GET v4/advertisers/{+advertiserId}
 *     (get_entity reads the advertiser's currency for the snapshot)
 *   - schemas.InsertionOrder.optimizationObjective: "Required. The optimization
 *     objective of the insertion order." That is the input rule for
 *     insertionOrders.create / patch, not a guarantee that responses carry it.
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
import { InsertionOrder } from "../../src/generated/schemas/zod.js";
import {
  installFetchStub,
  createWireSession,
  DV360_HOST,
  type FetchStub,
  type WireSession,
} from "../helpers/wire.js";

const ADV = "111";
const CAMPAIGN = "222";
const IO = "333";
const ctx = { requestId: "wire-req" } as any;

/** An insertion order as insertionOrders.get / list return it, with no optimizationObjective. */
const IO_WITHOUT_OBJECTIVE = {
  name: `advertisers/${ADV}/insertionOrders/${IO}`,
  advertiserId: ADV,
  campaignId: CAMPAIGN,
  insertionOrderId: IO,
  displayName: "Legacy IO",
  insertionOrderType: "RTB",
  entityStatus: "ENTITY_STATUS_PAUSED",
  updateTime: "2026-11-01T00:00:00Z",
  pacing: { pacingPeriod: "PACING_PERIOD_FLIGHT", pacingType: "PACING_TYPE_EVEN" },
  frequencyCap: { unlimited: true },
  kpi: { kpiType: "KPI_TYPE_CPM", kpiAmountMicros: "2000000" },
  budget: {
    budgetUnit: "BUDGET_UNIT_CURRENCY",
    automationType: "INSERTION_ORDER_AUTOMATION_TYPE_NONE",
    budgetSegments: [
      {
        budgetAmountMicros: "1000000000",
        dateRange: {
          startDate: { year: 2026, month: 12, day: 1 },
          endDate: { year: 2026, month: 12, day: 31 },
        },
      },
    ],
  },
  bidStrategy: { fixedBid: { bidAmountMicros: "1500000" } },
  reservationType: "RESERVATION_TYPE_NOT_GUARANTEED",
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
    {
      method: "GET",
      path: `/v4/advertisers/${ADV}`,
      response: { advertiserId: ADV, generalConfig: { currencyCode: "EUR" } },
    },
  ]);
  session = await createWireSession();
});

afterEach(() => {
  session.dispose();
  stub.restore();
});

describe("generated InsertionOrder schema", () => {
  it("keeps optimizationObjective optional", () => {
    expect("optimizationObjective" in IO_WITHOUT_OBJECTIVE).toBe(false);
    expect(InsertionOrder.safeParse(IO_WITHOUT_OBJECTIVE).success).toBe(true);
  });
});

describe("dv360_list_entities: insertionOrder", () => {
  it("parses an insertion order returned without optimizationObjective", async () => {
    const input = ListEntitiesInputSchema.parse({
      entityType: "insertionOrder",
      advertiserId: ADV,
    });

    const result = await listEntitiesLogic(input, ctx, { sessionId: session.sessionId } as any);

    expect(result.entities).toHaveLength(1);
    expect(result.entities[0]).toMatchObject({ insertionOrderId: IO });
    expect(result.entities[0]).not.toHaveProperty("optimizationObjective");
    const requests = stub.to(DV360_HOST);
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("GET");
    expect(requests[0].path).toBe(`/v4/advertisers/${ADV}/insertionOrders`);
  });
});

describe("dv360_get_entity: insertionOrder", () => {
  it("parses an insertion order returned without optimizationObjective", async () => {
    const input = GetEntityInputSchema.parse({
      entityType: "insertionOrder",
      advertiserId: ADV,
      insertionOrderId: IO,
    });

    const result = await getEntityLogic(input, ctx, { sessionId: session.sessionId } as any);

    expect(result.entity).toMatchObject({ insertionOrderId: IO, displayName: "Legacy IO" });
    expect(result.entity).not.toHaveProperty("optimizationObjective");
    // The governed read partner still returns its snapshot for such an IO.
    expect(result).toMatchObject({ entityKind: "insertion_order", platformEntityId: IO });
    const requests = stub.to(DV360_HOST);
    expect(requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      `GET /v4/advertisers/${ADV}/insertionOrders/${IO}`,
      `GET /v4/advertisers/${ADV}`,
    ]);
    expect(requests[0].query).toEqual({});
  });
});

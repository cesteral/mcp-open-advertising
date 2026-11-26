// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Irreversible changes are confirmed before the first upstream write, on the
 * wire: only `fetch` is stubbed (tests/helpers/wire.ts). ENTITY_STATUS_ARCHIVED
 * is DV360's one-way status (registry.json `terminalStatusValues`; DV360 has no
 * unarchive).
 *
 * basis: request shapes as pinned in dv360-wire-requests.test.ts
 * (`advertisers.<collection>.patch` with `updateMask`, Discovery v4). This file
 * asserts only WHETHER a write is sent.
 */

import { describe } from "vitest";
import { describeTerminalConfirmation } from "@cesteral/shared/testkit";
import {
  updateEntityLogic,
  UpdateEntityInputSchema,
} from "../../src/mcp-server/tools/definitions/update-entity.tool.js";
import {
  bulkUpdateStatusLogic,
  BulkUpdateStatusInputSchema,
} from "../../src/mcp-server/tools/definitions/bulk-update-status.tool.js";
import {
  bulkUpdateEntitiesLogic,
  BulkUpdateEntitiesInputSchema,
} from "../../src/mcp-server/tools/definitions/bulk-update-entities.tool.js";
import { installFetchStub, createWireSession, DV360_HOST } from "../helpers/wire.js";

const ctx = { requestId: "terminal-wire" } as any;
const ADV = "111";

/** A line item that passes the update schema once patched (as in dv360-wire-requests.test.ts). */
function lineItem(id: string) {
  return {
    name: `advertisers/${ADV}/lineItems/${id}`,
    advertiserId: ADV,
    campaignId: "444",
    insertionOrderId: "333",
    lineItemId: id,
    displayName: `LI ${id}`,
    lineItemType: "LINE_ITEM_TYPE_DISPLAY_DEFAULT",
    entityStatus: "ENTITY_STATUS_ACTIVE",
    flight: { flightDateType: "LINE_ITEM_FLIGHT_DATE_TYPE_INHERITED" },
    budget: {
      budgetAllocationType: "LINE_ITEM_BUDGET_ALLOCATION_TYPE_UNLIMITED",
      budgetUnit: "BUDGET_UNIT_CURRENCY",
    },
    pacing: { pacingPeriod: "PACING_PERIOD_FLIGHT", pacingType: "PACING_TYPE_ASAP" },
    frequencyCap: { unlimited: true },
    partnerRevenueModel: {
      markupType: "PARTNER_REVENUE_MODEL_MARKUP_TYPE_TOTAL_MEDIA_COST_MARKUP",
      markupAmount: "0",
    },
    bidStrategy: { fixedBid: { bidAmountMicros: "1500000" } },
    containsEuPoliticalAds: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
  };
}

describe("dv360-mcp: irreversible changes are confirmed before the first write", () => {
  describeTerminalConfirmation({
    setup: async () => {
      const stub = installFetchStub([
        {
          method: "GET",
          path: `/v4/advertisers/${ADV}`,
          response: { advertiserId: ADV, generalConfig: { currencyCode: "USD" } },
        },
        {
          method: "GET",
          path: /\/lineItems\/\d+$/,
          response: (req) => lineItem(req.path.split("/").pop()!),
        },
        { method: "PATCH", path: /\/lineItems\/\d+$/, response: (req) => req.body },
      ]);
      const session = await createWireSession("dv360-terminal-wire");
      return {
        sessionId: session.sessionId,
        writes: () => stub.to(DV360_HOST).filter((r) => r.method !== "GET"),
        dispose: () => {
          session.dispose();
          stub.restore();
        },
      };
    },
    cases: [
      {
        tool: "dv360_update_entity",
        run: (input, sdk) => updateEntityLogic(input as any, ctx, sdk as any),
        terminal: UpdateEntityInputSchema.parse({
          entityType: "lineItem",
          advertiserId: ADV,
          lineItemId: "222",
          data: { entityStatus: "ENTITY_STATUS_ARCHIVED" },
          updateMask: "entityStatus",
        }),
        // The archived status is in `data` but outside the mask, so it is not written.
        ordinary: UpdateEntityInputSchema.parse({
          entityType: "lineItem",
          advertiserId: ADV,
          lineItemId: "222",
          data: { displayName: "LI renamed", entityStatus: "ENTITY_STATUS_ARCHIVED" },
          updateMask: "displayName",
        }),
      },
      {
        tool: "dv360_bulk_update_status",
        run: (input, sdk) => bulkUpdateStatusLogic(input as any, ctx, sdk as any),
        terminal: BulkUpdateStatusInputSchema.parse({
          entityType: "lineItem",
          advertiserId: ADV,
          entityIds: ["222", "223"],
          status: "ENTITY_STATUS_ARCHIVED",
        }),
        ordinary: BulkUpdateStatusInputSchema.parse({
          entityType: "lineItem",
          advertiserId: ADV,
          entityIds: ["222", "223"],
          status: "ENTITY_STATUS_PAUSED",
        }),
        ordinaryAsks: true,
      },
      {
        tool: "dv360_bulk_update_entities",
        run: (input, sdk) => bulkUpdateEntitiesLogic(input as any, ctx, sdk as any),
        terminal: BulkUpdateEntitiesInputSchema.parse({
          entityType: "lineItem",
          advertiserId: ADV,
          items: [
            { entityId: "222", data: { displayName: "Renamed" }, updateMask: "displayName" },
            {
              entityId: "223",
              data: { entityStatus: "ENTITY_STATUS_ARCHIVED" },
              updateMask: "entityStatus",
            },
          ],
        }),
        ordinary: BulkUpdateEntitiesInputSchema.parse({
          entityType: "lineItem",
          advertiserId: ADV,
          items: [{ entityId: "222", data: { displayName: "Renamed" }, updateMask: "displayName" }],
        }),
      },
    ],
  });
});

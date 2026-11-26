// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Irreversible changes are confirmed before the first upstream write, on the
 * wire: only `fetch` is stubbed (tests/helpers/wire.ts). REMOVED is Google Ads'
 * one-way status (registry.json `terminalStatusValues`), and a `remove`
 * operation is the same removal gads_remove_entity makes.
 *
 * basis: request shapes as pinned in gads-wire-requests.test.ts
 * (`customers/{id}/{resource}:mutate`, Google Ads API v26). Reads are
 * `googleAds:search` POSTs, so a write here is a `:mutate`. This file asserts
 * only WHETHER a write is sent.
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
  bulkMutateLogic,
  BulkMutateInputSchema,
} from "../../src/mcp-server/tools/definitions/bulk-mutate.tool.js";
import { installFetchStub, createWireSession, GADS_HOST } from "../helpers/wire.js";

const ctx = { requestId: "terminal-wire" } as any;
const CID = "1234567890";

describe("gads-mcp: irreversible changes are confirmed before the first write", () => {
  describeTerminalConfirmation({
    setup: () => {
      const stub = installFetchStub();
      const session = createWireSession("gads-terminal-wire");
      return {
        sessionId: session.sessionId,
        writes: () => stub.to(GADS_HOST).filter((r) => r.path.endsWith(":mutate")),
        dispose: () => {
          session.dispose();
          stub.restore();
        },
      };
    },
    cases: [
      {
        tool: "gads_update_entity",
        run: (input, sdk) => updateEntityLogic(input as any, ctx, sdk as any),
        terminal: UpdateEntityInputSchema.parse({
          entityType: "adGroup",
          customerId: CID,
          entityId: "777",
          data: { status: "REMOVED" },
          updateMask: "status",
        }),
        ordinary: UpdateEntityInputSchema.parse({
          entityType: "adGroup",
          customerId: CID,
          entityId: "777",
          data: { status: "PAUSED", name: "AG renamed" },
          updateMask: "status,name",
        }),
      },
      {
        tool: "gads_bulk_update_status",
        run: (input, sdk) => bulkUpdateStatusLogic(input as any, ctx, sdk as any),
        terminal: BulkUpdateStatusInputSchema.parse({
          entityType: "ad",
          customerId: CID,
          entityIds: ["777~1", "777~2"],
          status: "REMOVED",
        }),
        ordinary: BulkUpdateStatusInputSchema.parse({
          entityType: "ad",
          customerId: CID,
          entityIds: ["777~1", "777~2"],
          status: "PAUSED",
        }),
        ordinaryAsks: true,
      },
      {
        tool: "gads_bulk_mutate",
        run: (input, sdk) => bulkMutateLogic(input as any, ctx, sdk as any),
        terminal: BulkMutateInputSchema.parse({
          entityType: "adGroup",
          customerId: CID,
          operations: [
            { create: { name: "New AG", campaign: `customers/${CID}/campaigns/555` } },
            { remove: `customers/${CID}/adGroups/778` },
            {
              update: { resourceName: `customers/${CID}/adGroups/779`, status: "REMOVED" },
              updateMask: "status",
            },
          ],
        }),
        ordinary: BulkMutateInputSchema.parse({
          entityType: "adGroup",
          customerId: CID,
          operations: [
            { create: { name: "New AG", campaign: `customers/${CID}/campaigns/555` } },
            {
              update: { resourceName: `customers/${CID}/adGroups/777`, cpcBidMicros: "2000000" },
              updateMask: "cpcBidMicros",
            },
          ],
        }),
      },
    ],
  });
});

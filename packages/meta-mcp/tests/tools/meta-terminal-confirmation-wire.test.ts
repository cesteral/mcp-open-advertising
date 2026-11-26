// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Irreversible changes are confirmed before the first upstream write, on the
 * wire: only `fetch` is stubbed (tests/helpers/wire.ts). ARCHIVED and DELETED are Meta's one-way statuses (registry.json `terminalStatusValues`).
 *
 * basis: request shapes as pinned in meta-wire-requests.test.ts (POST /{node-id} with the fields, Graph API). This file asserts only WHETHER a
 * write is sent.
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
import { installFetchStub, createWireSession, GRAPH_HOST } from "../helpers/wire.js";

const ctx = { requestId: "terminal-wire" } as any;
const ADSET = "120200000000002";

describe("meta-mcp: irreversible changes are confirmed before the first write", () => {
  describeTerminalConfirmation({
    setup: async () => {
      const stub = installFetchStub();
      const session = await createWireSession("meta-terminal-wire");
      return {
        sessionId: session.sessionId,
        writes: () => stub.requests.filter((r) => r.host === GRAPH_HOST && r.method !== "GET"),
        dispose: () => {
          session.dispose();
          stub.restore();
        },
      };
    },
    cases: [
      {
        tool: "meta_update_entity",
        run: (input, sdk) => updateEntityLogic(input as any, ctx, sdk as any),
        terminal: UpdateEntityInputSchema.parse({
          entityType: "adSet",
          entityId: ADSET,
          data: { status: "ARCHIVED" },
        }),
        ordinary: UpdateEntityInputSchema.parse({
          entityType: "adSet",
          entityId: ADSET,
          data: { daily_budget: 3000, status: "PAUSED" },
        }),
      },
      {
        tool: "meta_bulk_update_status",
        run: (input, sdk) => bulkUpdateStatusLogic(input as any, ctx, sdk as any),
        terminal: BulkUpdateStatusInputSchema.parse({
          entityType: "campaign",
          entityIds: ["120200000000001", ADSET],
          status: "ARCHIVED",
        }),
        ordinary: BulkUpdateStatusInputSchema.parse({
          entityType: "campaign",
          entityIds: ["120200000000001", ADSET],
          status: "PAUSED",
        }),
        ordinaryAsks: true,
      },
      {
        tool: "meta_bulk_update_entities",
        run: (input, sdk) => bulkUpdateEntitiesLogic(input as any, ctx, sdk as any),
        terminal: BulkUpdateEntitiesInputSchema.parse({
          entityType: "adSet",
          items: [
            { entityId: ADSET, data: { name: "Renamed" } },
            { entityId: "120200000000003", data: { status: "DELETED" } },
          ],
        }),
        ordinary: BulkUpdateEntitiesInputSchema.parse({
          entityType: "adSet",
          items: [{ entityId: ADSET, data: { name: "Renamed" } }],
        }),
      },
    ],
  });
});

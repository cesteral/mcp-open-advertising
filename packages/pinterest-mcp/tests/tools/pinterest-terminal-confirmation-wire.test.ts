// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Irreversible changes are confirmed before the first upstream write, on the
 * wire: only `fetch` is stubbed (tests/helpers/wire.ts). ARCHIVED is Pinterest's soft delete, which no tool on this server reverses
 * (registry.json `terminalStatusValues`).
 *
 * basis: request shapes as pinned in pinterest-wire-requests.test.ts (PATCH /v5/ad_accounts/{id}/{collection}). This file asserts only WHETHER a
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
import {
  installFetchStub,
  createWireSession,
  PINTEREST_HOST,
  AD_ACCOUNT_ID,
} from "../helpers/wire.js";

const ctx = { requestId: "terminal-wire" } as any;
const AD = AD_ACCOUNT_ID;

describe("pinterest-mcp: irreversible changes are confirmed before the first write", () => {
  describeTerminalConfirmation({
    setup: async () => {
      const stub = installFetchStub();
      const session = await createWireSession("pinterest-terminal-wire");
      return {
        sessionId: session.sessionId,
        writes: () => stub.requests.filter((r) => r.host === PINTEREST_HOST && r.method !== "GET"),
        dispose: () => {
          session.dispose();
          stub.restore();
        },
      };
    },
    cases: [
      {
        tool: "pinterest_update_entity",
        run: (input, sdk) => updateEntityLogic(input as any, ctx, sdk as any),
        terminal: UpdateEntityInputSchema.parse({
          entityType: "adGroup",
          adAccountId: AD,
          entityId: "201",
          data: { status: "ARCHIVED" },
        }),
        ordinary: UpdateEntityInputSchema.parse({
          entityType: "adGroup",
          adAccountId: AD,
          entityId: "201",
          data: { name: "AG renamed" },
        }),
      },
      {
        tool: "pinterest_bulk_update_status",
        run: (input, sdk) => bulkUpdateStatusLogic(input as any, ctx, sdk as any),
        terminal: BulkUpdateStatusInputSchema.parse({
          entityType: "adGroup",
          adAccountId: AD,
          entityIds: ["201", "202"],
          operationStatus: "ARCHIVED",
        }),
        ordinary: BulkUpdateStatusInputSchema.parse({
          entityType: "adGroup",
          adAccountId: AD,
          entityIds: ["201", "202"],
          operationStatus: "PAUSED",
        }),
        ordinaryAsks: true,
      },
      {
        tool: "pinterest_bulk_update_entities",
        run: (input, sdk) => bulkUpdateEntitiesLogic(input as any, ctx, sdk as any),
        terminal: BulkUpdateEntitiesInputSchema.parse({
          entityType: "campaign",
          adAccountId: AD,
          items: [
            { entityId: "101", data: { name: "Renamed" } },
            { entityId: "102", data: { status: "ARCHIVED" } },
          ],
        }),
        ordinary: BulkUpdateEntitiesInputSchema.parse({
          entityType: "campaign",
          adAccountId: AD,
          items: [{ entityId: "101", data: { name: "Renamed" } }],
        }),
      },
    ],
  });
});

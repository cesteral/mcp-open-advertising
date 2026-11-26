// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Irreversible changes are confirmed before the first upstream write, on the
 * wire: only `fetch` is stubbed (tests/helpers/wire.ts). A placement's PLACEMENT_STATUS_PERMANENTLY_ARCHIVED (PERMANENTLY_ARCHIVED on the
 * bulk tool) is CM360's one-way status (registry.json `terminalStatusValues`).
 *
 * basis: request shapes as pinned in cm360-wire-requests.test.ts (`placements.patch` / `.update`, CM360 API v5). This file asserts only WHETHER a
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
import { installFetchStub, createWireSession, CM360_HOST } from "../helpers/wire.js";

const ctx = { requestId: "terminal-wire" } as any;
const PID = "123456";

describe("cm360-mcp: irreversible changes are confirmed before the first write", () => {
  describeTerminalConfirmation({
    setup: async () => {
      const stub = installFetchStub();
      const session = await createWireSession("cm360-terminal-wire");
      return {
        sessionId: session.sessionId,
        writes: () => stub.requests.filter((r) => r.host === CM360_HOST && r.method !== "GET"),
        dispose: () => {
          session.dispose();
          stub.restore();
        },
      };
    },
    cases: [
      {
        tool: "cm360_update_entity",
        run: (input, sdk) => updateEntityLogic(input as any, ctx, sdk as any),
        terminal: UpdateEntityInputSchema.parse({
          profileId: PID,
          entityType: "placement",
          entityId: "2",
          data: { activeStatus: "PLACEMENT_STATUS_PERMANENTLY_ARCHIVED" },
        }),
        ordinary: UpdateEntityInputSchema.parse({
          profileId: PID,
          entityType: "placement",
          entityId: "2",
          data: { name: "New" },
        }),
      },
      {
        tool: "cm360_bulk_update_status",
        run: (input, sdk) => bulkUpdateStatusLogic(input as any, ctx, sdk as any),
        terminal: BulkUpdateStatusInputSchema.parse({
          profileId: PID,
          entityType: "placement",
          entityIds: ["2", "3"],
          status: "PERMANENTLY_ARCHIVED",
        }),
        ordinary: BulkUpdateStatusInputSchema.parse({
          profileId: PID,
          entityType: "placement",
          entityIds: ["2", "3"],
          status: "ARCHIVED",
        }),
        ordinaryAsks: true,
      },
      {
        tool: "cm360_bulk_update_entities",
        run: (input, sdk) => bulkUpdateEntitiesLogic(input as any, ctx, sdk as any),
        terminal: BulkUpdateEntitiesInputSchema.parse({
          profileId: PID,
          entityType: "placement",
          items: [
            { entityId: "2", data: { name: "Renamed" } },
            { entityId: "3", data: { activeStatus: "PLACEMENT_STATUS_PERMANENTLY_ARCHIVED" } },
          ],
        }),
        ordinary: BulkUpdateEntitiesInputSchema.parse({
          profileId: PID,
          entityType: "placement",
          items: [{ entityId: "2", data: { name: "Renamed" } }],
        }),
      },
    ],
  });
});

// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Irreversible changes are confirmed before the first upstream write, on the
 * wire: only `fetch` is stubbed (tests/helpers/wire.ts). operation_status DELETE
 * is TikTok's one-way status (registry.json `terminalStatusValues`).
 *
 * basis: request shapes as pinned in tiktok-wire-requests.test.ts
 * (`POST /open_api/v1.3/{entity}/status/update/`). This file asserts only
 * WHETHER a write is sent.
 */

import { describe } from "vitest";
import { describeTerminalConfirmation } from "@cesteral/shared/testkit";
import {
  bulkUpdateStatusLogic,
  BulkUpdateStatusInputSchema,
} from "../../src/mcp-server/tools/definitions/bulk-update-status.tool.js";
import {
  updateSmartPlusStatusLogic,
  UpdateSmartPlusStatusInputSchema,
} from "../../src/mcp-server/tools/definitions/update-smart-plus-status.tool.js";
import {
  installFetchStub,
  createWireSession,
  TIKTOK_HOST,
  TEST_ADVERTISER_ID,
} from "../helpers/wire.js";

const ctx = { requestId: "terminal-wire" } as any;
const ADV = TEST_ADVERTISER_ID;
const IDS = ["1700000000000001", "1700000000000002"];

describe("tiktok-mcp: irreversible changes are confirmed before the first write", () => {
  describeTerminalConfirmation({
    setup: () => {
      const stub = installFetchStub();
      const session = createWireSession("tiktok-terminal-wire");
      return {
        sessionId: session.sessionId,
        writes: () => stub.requests.filter((r) => r.host === TIKTOK_HOST && r.method === "POST"),
        dispose: () => {
          session.dispose();
          stub.restore();
        },
      };
    },
    cases: [
      {
        tool: "tiktok_bulk_update_status",
        run: (input, sdk) => bulkUpdateStatusLogic(input as any, ctx, sdk as any),
        terminal: BulkUpdateStatusInputSchema.parse({
          entityType: "adGroup",
          advertiserId: ADV,
          entityIds: IDS,
          operationStatus: "DELETE",
        }),
        ordinary: BulkUpdateStatusInputSchema.parse({
          entityType: "adGroup",
          advertiserId: ADV,
          entityIds: IDS,
          operationStatus: "DISABLE",
        }),
        ordinaryAsks: true,
      },
      {
        tool: "tiktok_update_smart_plus_status",
        run: (input, sdk) => updateSmartPlusStatusLogic(input as any, ctx, sdk as any),
        terminal: UpdateSmartPlusStatusInputSchema.parse({
          entityType: "adGroup",
          advertiserId: ADV,
          entityIds: IDS,
          operationStatus: "DELETE",
        }),
        ordinary: UpdateSmartPlusStatusInputSchema.parse({
          entityType: "adGroup",
          advertiserId: ADV,
          entityIds: IDS,
          operationStatus: "DISABLE",
        }),
        ordinaryAsks: true,
      },
    ],
  });
});

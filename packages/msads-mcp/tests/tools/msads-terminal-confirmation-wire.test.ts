// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Irreversible changes are confirmed before the first upstream write, on the
 * wire: only `fetch` is stubbed (tests/testkit/wire.ts). Status=Deleted removes
 * a Microsoft Advertising entity, which has no undelete (registry.json
 * `terminalStatusValues`); a deleted criterion cannot be restored either.
 *
 * basis: request shapes as pinned in msads-wire-requests.test.ts
 * (campaign-management-service/update{adgroups,keywords}.md `PUT …/v13/…`,
 * deletecampaigncriterions.md `DELETE …/v13/CampaignCriterions`). Reads are
 * `…/Query…` POSTs (`isMsAdsReadPath`). This file asserts only WHETHER a write
 * is sent.
 */

import { describe } from "vitest";
import { describeTerminalConfirmation } from "@cesteral/shared/testkit";
import { updateEntityLogic } from "../../src/mcp-server/tools/definitions/update-entity.tool.js";
import { bulkUpdateEntitiesLogic } from "../../src/mcp-server/tools/definitions/bulk-update-entities.tool.js";
import { manageCriterionsLogic } from "../../src/mcp-server/tools/definitions/manage-criterions.tool.js";
import {
  installFetchStub,
  createWireSession,
  isMsAdsReadPath,
  CAMPAIGN_HOST,
} from "../testkit/wire.js";

const ctx = { requestId: "terminal-wire" } as any;

describe("msads-mcp: irreversible changes are confirmed before the first write", () => {
  describeTerminalConfirmation({
    setup: async () => {
      const stub = installFetchStub();
      const session = await createWireSession("msads-terminal-wire");
      return {
        sessionId: session.sessionId,
        writes: () =>
          stub.requests.filter(
            (r) => r.host === CAMPAIGN_HOST && r.method !== "GET" && !isMsAdsReadPath(r.path)
          ),
        dispose: () => {
          session.dispose();
          stub.restore();
        },
      };
    },
    cases: [
      {
        tool: "msads_update_entity",
        run: (input, sdk) => updateEntityLogic(input as any, ctx, sdk as any),
        terminal: {
          entityType: "adGroup",
          entityId: "1",
          campaignId: "20",
          data: { Status: "Deleted" },
          dry_run: false,
        },
        ordinary: {
          entityType: "adGroup",
          entityId: "1",
          campaignId: "20",
          data: { CpcBid: { Amount: 1.5 } },
          dry_run: false,
        },
      },
      {
        tool: "msads_bulk_update_entities",
        run: (input, sdk) => bulkUpdateEntitiesLogic(input as any, ctx, sdk as any),
        terminal: {
          entityType: "keyword",
          adGroupId: "30",
          items: [
            { Id: 8, Bid: { Amount: 0.75 } },
            { Id: 9, Status: "Deleted" },
          ],
          dry_run: false,
        },
        ordinary: {
          entityType: "keyword",
          adGroupId: "30",
          items: [{ Id: 8, Text: "renamed" }],
          dry_run: false,
        },
      },
      {
        tool: "msads_manage_criterions",
        run: (input, sdk) => manageCriterionsLogic(input as any, ctx, sdk as any),
        terminal: {
          operation: "delete",
          entityLevel: "campaign",
          data: { CampaignId: 20, CampaignCriterionIds: [501, 502] },
          dry_run: false,
        },
        ordinary: {
          operation: "update",
          entityLevel: "adGroup",
          data: { AdGroupCriterions: [{ Id: 7, AdGroupId: 30 }], CriterionType: "Targets" },
          dry_run: false,
        },
      },
    ],
  });
});

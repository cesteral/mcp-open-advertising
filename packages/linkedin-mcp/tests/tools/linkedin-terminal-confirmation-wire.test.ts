// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Irreversible changes are confirmed before the first upstream write, on the
 * wire: only `fetch` is stubbed (tests/helpers/wire.ts). CANCELED and PENDING_DELETION are LinkedIn's one-way statuses (registry.json
 * `terminalStatusValues`); ARCHIVED is reversible and does not ask.
 *
 * basis: request shapes as pinned in linkedin-wire-requests.test.ts (PARTIAL_UPDATE POST with `patch.$set`, Rest.li 2.0). This file asserts only WHETHER a
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
import { installFetchStub, createWireSession, API_HOST } from "../helpers/wire.js";

const ctx = { requestId: "terminal-wire" } as any;
const ACCOUNT_URN = "urn:li:sponsoredAccount:507404993";
const CAMPAIGN_URN = "urn:li:sponsoredCampaign:700000001";
const CAMPAIGN_URN_2 = "urn:li:sponsoredCampaign:700000002";

describe("linkedin-mcp: irreversible changes are confirmed before the first write", () => {
  describeTerminalConfirmation({
    setup: async () => {
      const stub = installFetchStub();
      const session = await createWireSession("linkedin-terminal-wire");
      return {
        sessionId: session.sessionId,
        writes: () => stub.requests.filter((r) => r.host === API_HOST && r.method !== "GET"),
        dispose: () => {
          session.dispose();
          stub.restore();
        },
      };
    },
    cases: [
      {
        tool: "linkedin_update_entity",
        run: (input, sdk) => updateEntityLogic(input as any, ctx, sdk as any),
        terminal: UpdateEntityInputSchema.parse({
          entityType: "campaign",
          entityUrn: CAMPAIGN_URN,
          adAccountUrn: ACCOUNT_URN,
          data: { status: "PENDING_DELETION" },
        }),
        ordinary: UpdateEntityInputSchema.parse({
          entityType: "campaign",
          entityUrn: CAMPAIGN_URN,
          adAccountUrn: ACCOUNT_URN,
          data: { status: "ARCHIVED" },
        }),
      },
      {
        tool: "linkedin_bulk_update_status",
        run: (input, sdk) => bulkUpdateStatusLogic(input as any, ctx, sdk as any),
        terminal: BulkUpdateStatusInputSchema.parse({
          entityType: "campaign",
          adAccountUrn: ACCOUNT_URN,
          entityUrns: [CAMPAIGN_URN, CAMPAIGN_URN_2],
          status: "CANCELED",
        }),
        ordinary: BulkUpdateStatusInputSchema.parse({
          entityType: "campaign",
          adAccountUrn: ACCOUNT_URN,
          entityUrns: [CAMPAIGN_URN, CAMPAIGN_URN_2],
          status: "ARCHIVED",
        }),
        ordinaryAsks: true,
      },
      {
        tool: "linkedin_bulk_update_entities",
        run: (input, sdk) => bulkUpdateEntitiesLogic(input as any, ctx, sdk as any),
        terminal: BulkUpdateEntitiesInputSchema.parse({
          entityType: "campaign",
          adAccountUrn: ACCOUNT_URN,
          items: [
            { entityUrn: CAMPAIGN_URN, data: { name: "Renamed" } },
            { entityUrn: CAMPAIGN_URN_2, data: { status: "CANCELED" } },
          ],
        }),
        ordinary: BulkUpdateEntitiesInputSchema.parse({
          entityType: "campaign",
          adAccountUrn: ACCOUNT_URN,
          items: [{ entityUrn: CAMPAIGN_URN, data: { name: "Renamed" } }],
        }),
      },
    ],
  });
});

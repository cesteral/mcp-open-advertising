// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Irreversible changes are confirmed before the first upstream write, on the
 * wire: only `fetch` is stubbed (tests/helpers/wire.ts). Archived is TTD's
 * one-way Availability (registry.json `terminalStatusValues`); a deleted bid
 * list and a free-form GraphQL mutation cannot be reversed through this server.
 *
 * basis: request shapes as pinned in ttd-wire-requests.test.ts (partial PUT
 * /v3/{entity}, docs/api/TTD_Foundations.md:502-510; bidListDelete,
 * docs/api/ttd_partner_portal_api_docs.md:6278-6290; createMutationBulk on the
 * sandbox). This file asserts only WHETHER a write is sent.
 */

import { describe, it, expect } from "vitest";
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
  bidListLogic,
  BidListInputSchema,
} from "../../src/mcp-server/tools/definitions/manage-bid-list.tool.js";
import {
  graphqlQueryLogic,
  GraphqlQueryInputSchema,
  mutationOperations,
} from "../../src/mcp-server/tools/definitions/graphql-query.tool.js";
import {
  graphqlMutationBulkLogic,
  GraphqlMutationBulkInputSchema,
} from "../../src/mcp-server/tools/definitions/graphql-mutation-bulk.tool.js";
import {
  installFetchStub,
  createWireSession,
  SANDBOX_GRAPHQL_URL,
  SANDBOX_REST_BASE_URL,
} from "../helpers/wire.js";

const ctx = { requestId: "terminal-wire" } as any;
const ADV = "adv001";
const SANDBOX_HOSTS = new Set([
  new URL(SANDBOX_GRAPHQL_URL).host,
  new URL(SANDBOX_REST_BASE_URL).host,
]);
const MUTATION =
  "mutation UpdateBidList($input: BidListUpdateInput!) { bidListUpdate(input: $input) { data { id } } }";

describe("ttd-mcp: irreversible changes are confirmed before the first write", () => {
  describeTerminalConfirmation({
    setup: () => {
      const stub = installFetchStub();
      // The sandbox, so ttd_graphql_mutation_bulk is not refused for production.
      const session = createWireSession("ttd-terminal-wire", {
        graphqlUrl: SANDBOX_GRAPHQL_URL,
        baseUrl: SANDBOX_REST_BASE_URL,
      });
      return {
        sessionId: session.sessionId,
        // Every REST write is a PUT/POST/DELETE; every GraphQL call is a POST.
        // The cases' GraphQL calls are all mutations, and a query is never sent
        // before the question, so a POST here is a write.
        writes: () => stub.requests.filter((r) => SANDBOX_HOSTS.has(r.host) && r.method !== "GET"),
        dispose: () => {
          session.dispose();
          stub.restore();
        },
      };
    },
    cases: [
      {
        tool: "ttd_update_entity",
        run: (input, sdk) => updateEntityLogic(input as any, ctx, sdk as any),
        terminal: UpdateEntityInputSchema.parse({
          entityType: "campaign",
          entityId: "camp001",
          advertiserId: ADV,
          data: { Availability: "Archived" },
        }),
        ordinary: UpdateEntityInputSchema.parse({
          entityType: "campaign",
          entityId: "camp001",
          advertiserId: ADV,
          data: { CampaignName: "Autumn v2" },
        }),
      },
      {
        tool: "ttd_bulk_update_status",
        run: (input, sdk) => bulkUpdateStatusLogic(input as any, ctx, sdk as any),
        terminal: BulkUpdateStatusInputSchema.parse({
          entityType: "campaign",
          entityIds: ["camp001", "camp002"],
          status: "Archived",
        }),
        ordinary: BulkUpdateStatusInputSchema.parse({
          entityType: "campaign",
          entityIds: ["camp001", "camp002"],
          status: "Paused",
        }),
        ordinaryAsks: true,
      },
      {
        tool: "ttd_bulk_update_entities",
        run: (input, sdk) => bulkUpdateEntitiesLogic(input as any, ctx, sdk as any),
        terminal: BulkUpdateEntitiesInputSchema.parse({
          entityType: "adGroup",
          advertiserId: ADV,
          campaignId: "camp001",
          items: [
            { entityId: "ag001", data: { AdGroupName: "One" } },
            { entityId: "ag002", data: { Availability: "Archived" } },
          ],
        }),
        ordinary: BulkUpdateEntitiesInputSchema.parse({
          entityType: "adGroup",
          advertiserId: ADV,
          campaignId: "camp001",
          items: [{ entityId: "ag001", data: { AdGroupName: "One" } }],
        }),
      },
      {
        tool: "ttd_manage_bid_list",
        run: (input, sdk) => bidListLogic(input as any, ctx, sdk as any),
        terminal: BidListInputSchema.parse({ operation: "delete", data: { id: "bl1" } }),
        ordinary: BidListInputSchema.parse({
          operation: "update",
          bidListId: "bl1",
          data: { id: "bl1", name: "Renamed" },
        }),
      },
      {
        tool: "ttd_graphql_query",
        run: (input, sdk) => graphqlQueryLogic(input as any, ctx, sdk as any),
        terminal: GraphqlQueryInputSchema.parse({
          query:
            "mutation Del($input: BidListDeleteInput!) { bidListDelete(input: $input) { data { wasDeleted } } }",
          variables: { input: { id: "bl1" } },
        }),
        // A query changes nothing: it is sent (a POST, like every GraphQL call) unasked.
        ordinary: GraphqlQueryInputSchema.parse({
          query: 'query { advertiser(id: "adv001") { name } }',
        }),
      },
      {
        tool: "ttd_graphql_mutation_bulk",
        run: (input, sdk) => graphqlMutationBulkLogic(input as any, ctx, sdk as any),
        terminal: GraphqlMutationBulkInputSchema.parse({
          mutation: MUTATION,
          inputs: [{ id: "bl1" }, { id: "bl2" }],
        }),
      },
    ],
  });
});

describe("mutationOperations: which documents ttd_graphql_query confirms", () => {
  it("a query, a shorthand query and the word inside strings or comments are not mutations", () => {
    expect(mutationOperations("query Q { advertiser(id: 1) { name } }")).toBeNull();
    expect(mutationOperations("{ advertiser(id: 1) { name } }")).toBeNull();
    expect(mutationOperations('query { a(note: "mutation x") { id } } # mutation')).toBeNull();
    expect(mutationOperations('query { a(note: """\nmutation\n""") { id } }')).toBeNull();
  });

  it("a named or anonymous mutation is", () => {
    expect(mutationOperations("mutation Del($i: X!) { bidListDelete(input: $i) { id } }")).toEqual([
      "Del",
    ]);
    expect(mutationOperations("mutation { bidListDelete(input: {}) { id } }")).toEqual([]);
    expect(mutationOperations("query A { a { id } }\nmutation B { b { id } }")).toEqual(["B"]);
  });
});

// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.
//
// Governance contract (effect class) for the TTD long-tail write tools:
// graphql passthrough/bulk, bid-list management, seed management, archive.
// Each asserts: a confirmed execute returns an `effect` (EffectResultSchema) +
// a null-kind `dispatchedCapability`; where dry_run is supported, it returns a
// symbolic `EffectDryRunResult` and performs no API call; the effect summary
// never carries raw query/mutation/data payloads.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockResolveSessionServices } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

const { mockElicitArchive } = vi.hoisted(() => ({ mockElicitArchive: vi.fn() }));

vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return { ...actual, elicitArchiveConfirmation: mockElicitArchive };
});

import { EffectResultSchema, EffectDryRunResultSchema } from "@cesteral/shared";
import {
  graphqlQueryLogic,
  graphqlQueryTool,
  GraphqlQueryOutputSchema,
} from "../../src/mcp-server/tools/definitions/graphql-query.tool.js";
import {
  graphqlQueryBulkLogic,
  graphqlQueryBulkTool,
  GraphqlQueryBulkOutputSchema,
} from "../../src/mcp-server/tools/definitions/graphql-query-bulk.tool.js";
import {
  graphqlMutationBulkLogic,
  graphqlMutationBulkTool,
  GraphqlMutationBulkOutputSchema,
} from "../../src/mcp-server/tools/definitions/graphql-mutation-bulk.tool.js";
import {
  graphqlCancelBulkJobLogic,
  graphqlCancelBulkJobTool,
  GraphqlCancelBulkJobOutputSchema,
} from "../../src/mcp-server/tools/definitions/graphql-cancel-bulk-job.tool.js";
import {
  archiveEntitiesLogic,
  archiveEntitiesTool,
  ArchiveEntitiesOutputSchema,
} from "../../src/mcp-server/tools/definitions/archive-entities.tool.js";
import {
  bidListLogic,
  manageBidListTool,
  BidListOutputSchema,
} from "../../src/mcp-server/tools/definitions/bid-list.tool.js";
import {
  bidListBulkLogic,
  bulkManageBidListsTool,
  BidListBulkOutputSchema,
} from "../../src/mcp-server/tools/definitions/bid-list-bulk.tool.js";
import {
  manageSeedLogic,
  manageSeedTool,
  ManageSeedOutputSchema,
} from "../../src/mcp-server/tools/definitions/seed.tool.js";

const ctx = { requestId: "r" } as any;
const sdk = { sessionId: "s" } as any;

function effectAnnotation(tool: { annotations: { cesteral?: any } }) {
  return tool.annotations.cesteral;
}

describe("TTD long-tail governance contracts (effect class)", () => {
  let svc: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = {
      graphqlQuery: vi.fn(),
      archiveEntities: vi.fn(),
      createBidList: vi.fn(),
      getBidList: vi.fn(),
      updateBidList: vi.fn(),
      setBidList: vi.fn(),
      deleteBidList: vi.fn(),
      batchGetBidLists: vi.fn(),
      batchUpdateBidLists: vi.fn(),
    };
    mockResolveSessionServices.mockReturnValue({ ttdService: svc });
    mockElicitArchive.mockResolvedValue(true);
  });

  it("every long-tail tool declares a writeClass:effect contract with null entity scope", () => {
    const tools = [
      [graphqlQueryTool, "ttd.graphql_query.v1", false],
      [graphqlQueryBulkTool, "ttd.graphql_query_bulk.v1", true],
      [graphqlMutationBulkTool, "ttd.graphql_mutation_bulk.v1", true],
      [graphqlCancelBulkJobTool, "ttd.graphql_cancel_bulk_job.v1", true],
      [archiveEntitiesTool, "ttd.archive_entities.v1", true],
      [manageBidListTool, "ttd.manage_bid_list.v1", true],
      [bulkManageBidListsTool, "ttd.bulk_manage_bid_lists.v1", true],
      [manageSeedTool, "ttd.manage_seed.v1", true],
    ] as const;
    for (const [tool, contractId, supportsDryRun] of tools) {
      const c = effectAnnotation(tool);
      expect(c.kind).toBe("write");
      expect(c.writeClass).toBe("effect");
      expect(c.contractId).toBe(contractId);
      expect(c.entityKinds).toEqual([]);
      expect(c.supportsBeforeAfterSnapshot).toBe(false);
      expect(c.supportsDryRun).toBe(supportsDryRun);
      // effect writes never declare a readPartner
      expect(c.readPartner).toBeUndefined();
    }
  });

  it("graphql_query: execute emits graphql_executed effect (fingerprint only) + null-kind capability", async () => {
    svc.graphqlQuery.mockResolvedValue({ data: { advertiser: { id: "a1" } } });
    const result = await graphqlQueryLogic(
      { query: "query { advertiser(id:1){id} }", variables: { id: "1" } } as any,
      ctx,
      sdk
    );
    expect(result.effect?.effectKind).toBe("graphql_executed");
    // raw query/variables must NOT leak into the summary — only the hash
    expect(JSON.stringify(result.effect?.summary)).not.toContain("advertiser");
    expect(result.effect?.summary.fingerprint).toMatch(/^gql-/);
    expect(result.dispatchedCapability).toEqual({ operation: "manage", canonicalEntityKind: null });
    expect(() => GraphqlQueryOutputSchema.parse(result)).not.toThrow();
    expect(() => EffectResultSchema.parse(result.effect)).not.toThrow();
  });

  it("graphql_query_bulk: dry_run previews the job (no API call); execute emits bulk_job_submitted", async () => {
    const dry = await graphqlQueryBulkLogic(
      { query: "query{x}", variables: [{ id: 1 }, { id: 2 }], dry_run: true } as any,
      ctx,
      sdk
    );
    expect(svc.graphqlQuery).not.toHaveBeenCalled();
    expect(dry.dryRun?.expectedEffect?.summary).toEqual({ job_kind: "query", variable_sets: 2 });
    expect(dry.dispatchedCapability).toEqual({ operation: "bulk_job", canonicalEntityKind: null });
    expect(() => EffectDryRunResultSchema.parse(dry.dryRun)).not.toThrow();
    expect(() => GraphqlQueryBulkOutputSchema.parse(dry)).not.toThrow();

    svc.graphqlQuery.mockResolvedValue({
      data: { createQueryBulk: { data: { id: "j1", status: "QUEUED" } } },
    });
    const exec = await graphqlQueryBulkLogic(
      { query: "query{x}", variables: [{ id: 1 }] } as any,
      ctx,
      sdk
    );
    expect(exec.effect?.effectKind).toBe("bulk_job_submitted");
    expect(exec.effect?.summary.job_id).toBe("j1");
    expect(() => GraphqlQueryBulkOutputSchema.parse(exec)).not.toThrow();
  });

  it("graphql_mutation_bulk: dry_run previews inputs count; execute emits the job, no raw payloads", async () => {
    const dry = await graphqlMutationBulkLogic(
      { mutation: "mutation{x}", inputs: [{ a: 1 }, { a: 2 }, { a: 3 }], dry_run: true } as any,
      ctx,
      sdk
    );
    expect(svc.graphqlQuery).not.toHaveBeenCalled();
    expect(dry.dryRun?.expectedEffect?.summary).toEqual({ job_kind: "mutation", inputs: 3 });

    svc.graphqlQuery.mockResolvedValue({
      data: { createMutationBulk: { data: { id: "m1", status: "QUEUED" } } },
    });
    const exec = await graphqlMutationBulkLogic(
      { mutation: "mutation{x}", inputs: [{ a: 1 }] } as any,
      ctx,
      sdk
    );
    expect(exec.effect?.effectKind).toBe("bulk_job_submitted");
    expect(exec.dispatchedCapability.canonicalEntityKind).toBeNull();
    expect(() => GraphqlMutationBulkOutputSchema.parse(exec)).not.toThrow();
    expect(() => EffectResultSchema.parse(exec.effect)).not.toThrow();
  });

  it("graphql_cancel_bulk_job: dry_run previews cancellation; execute emits bulk_job_cancelled", async () => {
    const dry = await graphqlCancelBulkJobLogic({ jobId: "j1", dry_run: true } as any, ctx, sdk);
    expect(svc.graphqlQuery).not.toHaveBeenCalled();
    expect(dry.dryRun?.expectedEffect?.summary).toEqual({ job_id: "j1" });
    expect(dry.dispatchedCapability).toEqual({ operation: "manage", canonicalEntityKind: null });

    svc.graphqlQuery.mockResolvedValue({
      data: { cancelBulkJob: { data: { id: "j1", status: "CANCELLED" } } },
    });
    const exec = await graphqlCancelBulkJobLogic({ jobId: "j1" } as any, ctx, sdk);
    expect(exec.effect).toEqual({
      effectKind: "bulk_job_cancelled",
      summary: { job_id: "j1", status: "CANCELLED" },
    });
    expect(() => GraphqlCancelBulkJobOutputSchema.parse(exec)).not.toThrow();
  });

  it("archive_entities: dry_run skips confirmation + API; execute emits entities_archived", async () => {
    const dry = await archiveEntitiesLogic(
      { entityType: "adGroup", entityIds: ["a", "b"], dry_run: true } as any,
      ctx,
      sdk
    );
    expect(mockElicitArchive).not.toHaveBeenCalled();
    expect(svc.archiveEntities).not.toHaveBeenCalled();
    expect(dry.dryRun?.expectedEffect?.summary).toEqual({ entity_type: "adGroup", requested: 2 });
    expect(dry.dispatchedCapability).toEqual({ operation: "archive", canonicalEntityKind: null });
    expect(() => ArchiveEntitiesOutputSchema.parse(dry)).not.toThrow();

    svc.archiveEntities.mockResolvedValue({
      results: [
        { entityId: "a", success: true },
        { entityId: "b", success: true },
      ],
    });
    const exec = await archiveEntitiesLogic(
      { entityType: "adGroup", entityIds: ["a", "b"] } as any,
      ctx,
      sdk
    );
    expect(exec.effect?.effectKind).toBe("entities_archived");
    expect(exec.effect?.summary).toEqual({
      entity_type: "adGroup",
      requested: 2,
      succeeded: 2,
      failed: 0,
    });
    expect(() => ArchiveEntitiesOutputSchema.parse(exec)).not.toThrow();
  });

  it("archive_entities: declined confirmation reports the capability, no effect", async () => {
    mockElicitArchive.mockResolvedValue(false);
    const result = await archiveEntitiesLogic(
      { entityType: "campaign", entityIds: ["c1"] } as any,
      ctx,
      sdk
    );
    expect(svc.archiveEntities).not.toHaveBeenCalled();
    expect(result.confirmed).toBe(false);
    expect(result.effect).toBeUndefined();
    expect(result.dispatchedCapability.canonicalEntityKind).toBeNull();
  });

  it("manage_bid_list: dry_run previews the sub-op; execute emits bid_list_managed without raw data", async () => {
    const dry = await bidListLogic({ operation: "create", data: { name: "x" }, dry_run: true } as any, ctx, sdk);
    expect(svc.createBidList).not.toHaveBeenCalled();
    expect(dry.dryRun?.expectedEffect?.summary).toEqual({ operation: "create" });

    svc.updateBidList.mockResolvedValue({ id: "bl1", name: "x" });
    const exec = await bidListLogic(
      { operation: "update", bidListId: "bl1", data: { linesToAdd: [{ secret: 1 }] } } as any,
      ctx,
      sdk
    );
    expect(exec.effect).toEqual({
      effectKind: "bid_list_managed",
      summary: { operation: "update", bid_list_id: "bl1" },
    });
    // the raw `data` payload must never reach the effect summary
    expect(JSON.stringify(exec.effect?.summary)).not.toContain("secret");
    expect(exec.dispatchedCapability).toEqual({ operation: "manage", canonicalEntityKind: null });
    expect(() => BidListOutputSchema.parse(exec)).not.toThrow();
  });

  it("bulk_manage_bid_lists: dry_run previews item count; execute emits bid_lists_managed", async () => {
    const dry = await bidListBulkLogic(
      { operation: "batch_update", items: [{ id: "a" }, { id: "b" }], dry_run: true } as any,
      ctx,
      sdk
    );
    expect(svc.batchUpdateBidLists).not.toHaveBeenCalled();
    expect(dry.dryRun?.expectedEffect?.summary).toEqual({ operation: "batch_update", requested: 2 });
    expect(dry.dispatchedCapability).toEqual({ operation: "bulk_job", canonicalEntityKind: null });

    svc.batchUpdateBidLists.mockResolvedValue([{ success: true }, { success: false }]);
    const exec = await bidListBulkLogic(
      { operation: "batch_update", items: [{ id: "a" }, { id: "b" }] } as any,
      ctx,
      sdk
    );
    expect(exec.effect?.effectKind).toBe("bid_lists_managed");
    expect(exec.effect?.summary).toEqual({
      operation: "batch_update",
      requested: 2,
      succeeded: 1,
      failed: 1,
    });
    expect(() => BidListBulkOutputSchema.parse(exec)).not.toThrow();
  });

  it("manage_seed: dry_run previews the sub-op; execute emits seed_managed without raw data", async () => {
    const dry = await manageSeedLogic(
      { operation: "create", advertiserId: "adv1", data: { name: "x" }, dry_run: true } as any,
      ctx,
      sdk
    );
    expect(svc.graphqlQuery).not.toHaveBeenCalled();
    expect(dry.dryRun?.expectedEffect?.summary).toEqual({ operation: "create" });

    svc.graphqlQuery.mockResolvedValue({
      data: { seedCreate: { data: { id: "seed1", name: "x" }, userErrors: [] } },
    });
    const exec = await manageSeedLogic(
      { operation: "create", advertiserId: "adv1", data: { name: "secretname" } } as any,
      ctx,
      sdk
    );
    expect(exec.effect).toEqual({
      effectKind: "seed_managed",
      summary: { operation: "create", seed_id: "seed1" },
    });
    expect(JSON.stringify(exec.effect?.summary)).not.toContain("secretname");
    expect(exec.dispatchedCapability).toEqual({ operation: "manage", canonicalEntityKind: null });
    expect(() => ManageSeedOutputSchema.parse(exec)).not.toThrow();
  });
});

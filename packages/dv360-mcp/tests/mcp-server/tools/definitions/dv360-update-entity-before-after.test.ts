// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * PR-D: `before` / `after` snapshot capture on real (non-dry-run) writes.
 *
 * DV360 PATCH returns the patched resource directly — `after` normalizes that
 * shape with no extra round-trip. `before` normalizes the entity already read
 * during the existing `previousValues` capture path. If the patched resource
 * isn't normalizable (e.g. unexpected SDK envelope), the handler falls back
 * to a re-read; that fallback is exercised here too.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

const { mockResolveSessionServices } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
}));

vi.mock("../../../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

vi.mock("../../../../src/mcp-server/tools/utils/entity-mapping-dynamic.js", () => ({
  getSupportedEntityTypesDynamic: vi
    .fn()
    .mockReturnValue(["lineItem", "insertionOrder", "campaign", "advertiser"]),
  getEntityConfigDynamic: vi.fn().mockReturnValue({
    parentIds: ["advertiserId"],
    filterParamIds: [],
    queryParamIds: [],
    supportsFilter: true,
    supportsCreate: true,
    supportsUpdate: true,
    supportsDelete: true,
    apiPath: "/advertisers/{advertiserId}/lineItems",
  }),
  generateRelationshipDescription: vi.fn().mockReturnValue(""),
  validateEntityRelationships: vi.fn().mockReturnValue([]),
  getEntityHierarchyPath: vi.fn().mockReturnValue(["advertiser", "lineItem"]),
  getEntitySchemaForOperation: vi.fn().mockImplementation(() =>
    z.object({
      entityStatus: z
        .enum(["ENTITY_STATUS_ACTIVE", "ENTITY_STATUS_PAUSED", "ENTITY_STATUS_ARCHIVED"])
        .optional(),
      displayName: z.string().optional(),
    })
  ),
  getRequiredFieldsFromSchema: vi.fn().mockReturnValue([]),
}));

vi.mock("../../../../src/mcp-server/tools/utils/entity-id-extraction.js", async () => {
  const actual = await vi.importActual<
    typeof import("../../../../src/mcp-server/tools/utils/entity-id-extraction.js")
  >("../../../../src/mcp-server/tools/utils/entity-id-extraction.js");
  return {
    ...actual,
    extractEntityIds: vi
      .fn()
      .mockImplementation((input: Record<string, unknown>) => {
        const ids: Record<string, string> = {};
        for (const k of ["advertiserId", "campaignId", "insertionOrderId", "lineItemId"]) {
          if (input[k] && typeof input[k] === "string") {
            ids[k] = input[k] as string;
          }
        }
        return ids;
      }),
    extractParentIds: vi.fn(),
  };
});

vi.mock("../../../../src/mcp-server/tools/utils/parent-id-validation.js", () => ({
  addIdValidationIssues: vi.fn(),
  mergeIdsIntoData: vi
    .fn()
    .mockImplementation((_t, data: Record<string, unknown>) => ({ ...data })),
}));

vi.mock("../../../../src/mcp-server/tools/utils/simplified-schemas.js", () => ({
  createSimplifiedUpdateEntityInputSchema: vi.fn().mockReturnValue(
    z.object({
      entityType: z.enum(["lineItem", "insertionOrder", "campaign", "advertiser"]),
      advertiserId: z.string().optional(),
      campaignId: z.string().optional(),
      insertionOrderId: z.string().optional(),
      lineItemId: z.string().optional(),
      data: z.record(z.any()),
      updateMask: z.string(),
      reason: z.string().optional(),
      dry_run: z.boolean().optional().default(false),
    })
  ),
}));

vi.mock("../../../../src/mcp-server/tools/utils/entity-examples.js", () => ({
  getEntityTypesWithExamples: vi.fn().mockReturnValue(["lineItem"]),
  getEntityExamples: vi.fn().mockReturnValue([]),
  findMatchingExample: vi.fn().mockReturnValue(null),
  getEntityExamplesByCategory: vi.fn().mockReturnValue([]),
}));

import {
  updateEntityLogic,
  updateEntityTool,
  UpdateEntityOutputSchema,
} from "../../../../src/mcp-server/tools/definitions/update-entity.tool.js";

function ctx() {
  return { requestId: "r-ba", timestamp: new Date().toISOString(), operation: "test" } as any;
}

describe("dv360_update_entity before/after capture (PR-D)", () => {
  let dv360Service: {
    getEntity: ReturnType<typeof vi.fn>;
    updateEntity: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    dv360Service = {
      getEntity: vi.fn().mockResolvedValue({
        displayName: "Sample Line Item",
        entityStatus: "ENTITY_STATUS_ACTIVE",
        lineItemId: "li-1",
        advertiserId: "adv-1",
      }),
      updateEntity: vi.fn().mockResolvedValue({
        displayName: "Sample Line Item",
        entityStatus: "ENTITY_STATUS_PAUSED",
        lineItemId: "li-1",
        advertiserId: "adv-1",
      }),
    };
    mockResolveSessionServices.mockReturnValue({ dv360Service });
  });

  it("populates before and after snapshots in canonical shape on a successful write", async () => {
    const result = await updateEntityLogic(
      {
        entityType: "lineItem",
        advertiserId: "adv-1",
        lineItemId: "li-1",
        data: { entityStatus: "ENTITY_STATUS_PAUSED" },
        updateMask: "entityStatus",
        dry_run: false,
      } as any,
      ctx(),
      { sessionId: "s" } as any
    );

    expect(dv360Service.updateEntity).toHaveBeenCalledOnce();
    expect(result.before).toBeDefined();
    expect(result.after).toBeDefined();

    expect(result.before).toMatchObject({
      schemaVersion: 1,
      platform: "dv360",
      entityKind: "line_item",
      platformEntityId: "li-1",
      accountId: "adv-1",
      status: { canonical: "active", platformRaw: "ENTITY_STATUS_ACTIVE" },
    });
    expect(result.after).toMatchObject({
      schemaVersion: 1,
      platform: "dv360",
      entityKind: "line_item",
      platformEntityId: "li-1",
      accountId: "adv-1",
      status: { canonical: "paused", platformRaw: "ENTITY_STATUS_PAUSED" },
    });
  });

  it("output schema accepts before/after as optional NormalizedEntitySnapshot fields", () => {
    const ok = UpdateEntityOutputSchema.safeParse({
      entity: {},
      timestamp: new Date().toISOString(),
    });
    expect(ok.success).toBe(true);
  });

  it("annotation now declares supportsBeforeAfterSnapshot: true", () => {
    const cesteral = (updateEntityTool.annotations as any).cesteral;
    expect(cesteral.supportsBeforeAfterSnapshot).toBe(true);
  });

  it("falls back to a re-read when the PATCH response is not normalizable", async () => {
    // The handler reads getEntity twice: once for `current`/`before`, once
    // (via the fallback path) for `after`. Replace the default so the queue
    // order is deterministic: pre-read returns ACTIVE, post-write fallback
    // re-read returns PAUSED.
    dv360Service.getEntity = vi
      .fn()
      .mockResolvedValueOnce({
        displayName: "Sample Line Item",
        entityStatus: "ENTITY_STATUS_ACTIVE",
        lineItemId: "li-1",
        advertiserId: "adv-1",
      })
      .mockResolvedValueOnce({
        displayName: "Sample Line Item",
        entityStatus: "ENTITY_STATUS_PAUSED",
        lineItemId: "li-1",
        advertiserId: "adv-1",
      });
    dv360Service.updateEntity.mockResolvedValueOnce({});

    const result = await updateEntityLogic(
      {
        entityType: "lineItem",
        advertiserId: "adv-1",
        lineItemId: "li-1",
        data: { entityStatus: "ENTITY_STATUS_PAUSED" },
        updateMask: "entityStatus",
        dry_run: false,
      } as any,
      ctx(),
      { sessionId: "s" } as any
    );

    expect(result.after).toBeDefined();
    expect(result.after).toMatchObject({
      status: { canonical: "paused", platformRaw: "ENTITY_STATUS_PAUSED" },
    });
  });
});

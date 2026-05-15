// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

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
  return { requestId: "r-dry", timestamp: new Date().toISOString(), operation: "test" } as any;
}

describe("dv360_update_entity dry_run", () => {
  let dv360Service: {
    getEntity: ReturnType<typeof vi.fn>;
    updateEntity: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    dv360Service = {
      getEntity: vi.fn().mockResolvedValue({
        displayName: "Old Name",
        entityStatus: "ENTITY_STATUS_ACTIVE",
        lineItemId: "li-1",
        advertiserId: "adv-1",
      }),
      updateEntity: vi.fn().mockResolvedValue({}),
    };
    mockResolveSessionServices.mockReturnValue({ dv360Service });
  });

  it("declares dryRun as an optional output field", () => {
    const ok = UpdateEntityOutputSchema.safeParse({
      entity: {},
      timestamp: new Date().toISOString(),
    });
    expect(ok.success).toBe(true);
  });

  it("does NOT call updateEntity when dry_run=true", async () => {
    const result = await updateEntityLogic(
      {
        entityType: "lineItem",
        advertiserId: "adv-1",
        lineItemId: "li-1",
        data: { entityStatus: "ENTITY_STATUS_PAUSED" },
        updateMask: "entityStatus",
        dry_run: true,
      } as any,
      ctx(),
      { sessionId: "s" } as any
    );

    expect(dv360Service.updateEntity).not.toHaveBeenCalled();
    expect(dv360Service.getEntity).toHaveBeenCalled();
    expect(result.dryRun).toBeDefined();
    expect(result.dryRun!.wouldSucceed).toBe(true);
    expect(result.dryRun!.validationSource).toBe("symbolic");
    expect(result.dryRun!.expectedStateSource).toBe("server_symbolic_apply");
  });

  it("symbolic apply produces a NormalizedEntitySnapshot for line items", async () => {
    const result = await updateEntityLogic(
      {
        entityType: "lineItem",
        advertiserId: "adv-1",
        lineItemId: "li-1",
        data: { entityStatus: "ENTITY_STATUS_PAUSED" },
        updateMask: "entityStatus",
        dry_run: true,
      } as any,
      ctx(),
      { sessionId: "s" } as any
    );

    const state = result.dryRun!.expectedPostState!;
    expect(state.platform).toBe("dv360");
    expect(state.entityKind).toBe("line_item");
    expect(state.platformEntityId).toBe("li-1");
    expect(state.status.canonical).toBe("paused");
    expect(state.status.platformRaw).toBe("ENTITY_STATUS_PAUSED");
    expect(state.accountId).toBe("adv-1");
  });

  it("symbolic Zod validation surfaces invalid entityStatus values", async () => {
    const result = await updateEntityLogic(
      {
        entityType: "lineItem",
        advertiserId: "adv-1",
        lineItemId: "li-1",
        data: { entityStatus: "ENTITY_STATUS_BOGUS" },
        updateMask: "entityStatus",
        dry_run: true,
      } as any,
      ctx(),
      { sessionId: "s" } as any
    );

    expect(dv360Service.updateEntity).not.toHaveBeenCalled();
    expect(result.dryRun!.wouldSucceed).toBe(false);
    expect(result.dryRun!.validationErrors.length).toBeGreaterThan(0);
    expect(result.dryRun!.validationErrors[0].field).toBe("entityStatus");
  });

  it("falls back to expectedStateSource: 'none' when read partner fails", async () => {
    dv360Service.getEntity.mockRejectedValueOnce(new Error("404"));
    const result = await updateEntityLogic(
      {
        entityType: "lineItem",
        advertiserId: "adv-1",
        lineItemId: "li-1",
        data: { entityStatus: "ENTITY_STATUS_PAUSED" },
        updateMask: "entityStatus",
        dry_run: true,
      } as any,
      ctx(),
      { sessionId: "s" } as any
    );
    expect(result.dryRun!.expectedStateSource).toBe("none");
    expect(result.dryRun!.expectedPostState).toBeUndefined();
  });

  it("default (dry_run unset) preserves existing write behavior", async () => {
    dv360Service.updateEntity.mockResolvedValueOnce({
      displayName: "Updated",
      entityStatus: "ENTITY_STATUS_ACTIVE",
    });
    const result = await updateEntityLogic(
      {
        entityType: "lineItem",
        advertiserId: "adv-1",
        lineItemId: "li-1",
        data: { displayName: "Updated" },
        updateMask: "displayName",
      } as any,
      ctx(),
      { sessionId: "s" } as any
    );
    expect(dv360Service.updateEntity).toHaveBeenCalledOnce();
    expect(result.entity).toEqual(expect.objectContaining({ displayName: "Updated" }));
    expect(result.dryRun).toBeUndefined();
  });

  it("annotation reflects supportsDryRun: true", () => {
    const cesteral = (updateEntityTool.annotations as any).cesteral;
    expect(cesteral.supportsDryRun).toBe(true);
  });
});

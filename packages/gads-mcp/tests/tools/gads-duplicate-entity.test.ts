import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: vi.fn(),
}));

import { resolveSessionServices } from "../../src/mcp-server/tools/utils/resolve-session.js";
const mockResolve = vi.mocked(resolveSessionServices);

import {
  duplicateEntityLogic,
  DuplicateEntityInputSchema,
} from "../../src/mcp-server/tools/definitions/duplicate-entity.tool.js";

let svc: {
  getEntity: ReturnType<typeof vi.fn>;
  createEntity: ReturnType<typeof vi.fn>;
  validateEntity: ReturnType<typeof vi.fn>;
};

const ctx = { requestId: "r" } as any;
const sdk = { sessionId: "s" } as any;

beforeEach(() => {
  vi.clearAllMocks();
  svc = {
    getEntity: vi.fn().mockResolvedValue({
      campaign: {
        id: "111",
        resourceName: "customers/1/campaigns/111",
        name: "Summer",
        status: "PAUSED",
        advertisingChannelType: "SEARCH",
        campaignBudget: "customers/1/campaignBudgets/9",
      },
    }),
    createEntity: vi
      .fn()
      .mockResolvedValue({ results: [{ resourceName: "customers/1/campaigns/222" }] }),
    validateEntity: vi.fn().mockResolvedValue({ valid: true }),
  };
  mockResolve.mockReturnValue({ gadsService: svc } as any);
});

describe("gads_duplicate_entity", () => {
  it("reads the source, strips id/resourceName, and creates the copy", async () => {
    const result = await duplicateEntityLogic(
      { entityType: "campaign", customerId: "1", entityId: "111" } as any,
      ctx,
      sdk
    );

    expect(svc.getEntity).toHaveBeenCalledWith("campaign", "1", "111", ctx);
    const createPayload = svc.createEntity.mock.calls[0][2];
    expect(createPayload).not.toHaveProperty("id");
    expect(createPayload).not.toHaveProperty("resourceName");
    expect(createPayload.name).toBe("Summer");
    expect(createPayload.campaignBudget).toBe("customers/1/campaignBudgets/9");
    expect(result.sourceEntityId).toBe("111");
    expect(result.dispatchedCapability).toEqual({
      operation: "duplicate",
      canonicalEntityKind: "campaign",
    });
  });

  it("applies option overrides over the copied fields", async () => {
    await duplicateEntityLogic(
      { entityType: "campaign", customerId: "1", entityId: "111", options: { name: "New" } } as any,
      ctx,
      sdk
    );
    expect(svc.createEntity.mock.calls[0][2].name).toBe("New");
  });

  it("dry_run validates via native validateOnly and does not create", async () => {
    const result = await duplicateEntityLogic(
      { entityType: "campaign", customerId: "1", entityId: "111", dry_run: true } as any,
      ctx,
      sdk
    );
    expect(svc.createEntity).not.toHaveBeenCalled();
    expect(svc.validateEntity).toHaveBeenCalled();
    expect(result.dryRun?.validationSource).toBe("native_validator");
    expect(result.dispatchedCapability.canonicalEntityKind).toBe("campaign");
  });

  it("restricts the input schema to duplicable entity types", () => {
    expect(
      DuplicateEntityInputSchema.safeParse({
        entityType: "campaign",
        customerId: "1",
        entityId: "e",
      }).success
    ).toBe(true);
    expect(
      DuplicateEntityInputSchema.safeParse({
        entityType: "adGroup",
        customerId: "1",
        entityId: "e",
      }).success
    ).toBe(false);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockResolveSessionServices } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

vi.mock("../../src/mcp-server/tools/utils/entity-mapping.js", () => ({
  getEntityTypeEnum: vi.fn().mockReturnValue(["campaign", "campaignGroup", "creative"]),
}));

import {
  duplicateEntityLogic,
  duplicateEntityResponseFormatter,
} from "../../src/mcp-server/tools/definitions/duplicate-entity.tool.js";

const ctx = { requestId: "r" } as any;
const sdk = { sessionId: "s" } as any;

describe("linkedin_duplicate_entity governance contract", () => {
  let svc: {
    duplicateEntity: ReturnType<typeof vi.fn>;
    getEntity: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    svc = {
      duplicateEntity: vi.fn().mockResolvedValue({
        id: "999",
        name: "Copy of Source Campaign",
        status: "DRAFT",
        account: "urn:li:sponsoredAccount:1",
      }),
      getEntity: vi.fn(),
    };
    mockResolveSessionServices.mockReturnValue({ linkedInService: svc });
  });

  it("dry_run reads the source and projects the DRAFT copy, no API call", async () => {
    svc.getEntity.mockResolvedValue({
      name: "Source Campaign",
      status: "ACTIVE",
      account: "urn:li:sponsoredAccount:1",
    });

    const result = await duplicateEntityLogic(
      { entityType: "campaign", entityUrn: "urn:li:sponsoredCampaign:1", dry_run: true } as any,
      ctx,
      sdk
    );

    expect(svc.duplicateEntity).not.toHaveBeenCalled();
    // DRAFT is not a canonical-mapped status → unknown, platformRaw DRAFT.
    expect(result.dryRun?.expectedPostState?.status).toEqual({
      canonical: "unknown",
      platformRaw: "DRAFT",
    });
    expect(result.dryRun?.expectedPostState?.platformEntityId).toBe("");
    expect(result.dispatchedCapability).toEqual({
      operation: "duplicate",
      canonicalEntityKind: "campaign",
    });
  });

  it("execute normalizes the returned new entity into after (no before)", async () => {
    const result = await duplicateEntityLogic(
      { entityType: "campaign", entityUrn: "urn:li:sponsoredCampaign:1" } as any,
      ctx,
      sdk
    );
    expect(svc.duplicateEntity).toHaveBeenCalledOnce();
    expect(result.after?.platformEntityId).toBe("999");
    expect(result.after?.displayName).toBe("Copy of Source Campaign");
    expect((result as any).before).toBeUndefined();
  });

  it("out-of-scope kind resolves canonicalEntityKind:null and skips snapshots", async () => {
    svc.duplicateEntity.mockResolvedValue({ id: "888" });
    const result = await duplicateEntityLogic(
      { entityType: "campaignGroup", entityUrn: "urn:li:sponsoredCampaignGroup:2" } as any,
      ctx,
      sdk
    );
    expect(result.dispatchedCapability).toEqual({
      operation: "duplicate",
      canonicalEntityKind: null,
    });
    expect(result.after).toBeUndefined();
  });

  it("out-of-scope dry_run does not throw and emits no snapshot", async () => {
    const result = await duplicateEntityLogic(
      {
        entityType: "campaignGroup",
        entityUrn: "urn:li:sponsoredCampaignGroup:2",
        dry_run: true,
      } as any,
      ctx,
      sdk
    );
    expect(svc.duplicateEntity).not.toHaveBeenCalled();
    expect(result.dispatchedCapability).toEqual({
      operation: "duplicate",
      canonicalEntityKind: null,
    });
    expect(result.dryRun?.expectedPostState).toBeUndefined();
    expect(result.dryRun?.expectedStateSource).toBe("none");
  });

  it("formatter renders a dry-run message without a false success", () => {
    const content = duplicateEntityResponseFormatter({
      sourceUrn: "urn:li:sponsoredCampaign:1",
      newEntity: {},
      entityType: "campaign",
      timestamp: "2026-06-02T00:00:00.000Z",
      dispatchedCapability: { operation: "duplicate", canonicalEntityKind: "campaign" },
      dryRun: {
        wouldSucceed: true,
        validationErrors: [],
        validationSource: "symbolic",
        expectedStateSource: "server_symbolic_apply",
      } as any,
    });
    expect(content[0].text).toContain("Dry run: duplicating campaign would succeed");
    expect(content[0].text).not.toContain("duplicated from");
  });
});

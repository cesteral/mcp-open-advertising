import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockResolveSessionServices } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

import {
  duplicateEntityLogic,
  DuplicateEntityInputSchema,
} from "../../src/mcp-server/tools/definitions/duplicate-entity.tool.js";

const mockDuplicateEntity = vi.fn();
const mockGetEntity = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mockResolveSessionServices.mockReturnValue({
    ttdService: { duplicateEntity: mockDuplicateEntity, getEntity: mockGetEntity },
  });
});

const ctx = { requestId: "req" } as any;
const sdk = { sessionId: "s" } as any;

describe("ttd_duplicate_entity", () => {
  it("clones a campaign and normalizes the new entity into `after`", async () => {
    mockDuplicateEntity.mockResolvedValue({
      CampaignId: "new-1",
      CampaignName: "Copy",
      Availability: { Availability: "Available" },
    });

    const result = await duplicateEntityLogic(
      { entityType: "campaign", entityId: "src-1" } as any,
      ctx,
      sdk
    );

    expect(mockDuplicateEntity).toHaveBeenCalledWith("campaign", "src-1", undefined, ctx);
    expect(result.newEntity.CampaignId).toBe("new-1");
    expect(result.sourceEntityId).toBe("src-1");
    expect(result.dispatchedCapability).toEqual({
      operation: "duplicate",
      canonicalEntityKind: "campaign",
    });
    expect((result as any).before).toBeUndefined();
  });

  it("dry_run reads the source and projects the copy without creating it", async () => {
    mockGetEntity.mockResolvedValue({
      CampaignId: "src-1",
      CampaignName: "Summer",
      Availability: { Availability: "Available" },
    });

    const result = await duplicateEntityLogic(
      {
        entityType: "campaign",
        entityId: "src-1",
        options: { CampaignName: "Copy of Summer" },
        dry_run: true,
      } as any,
      ctx,
      sdk
    );

    expect(mockDuplicateEntity).not.toHaveBeenCalled();
    expect(mockGetEntity).toHaveBeenCalledWith("campaign", "src-1", ctx);
    expect(result.dryRun).toBeDefined();
    expect(result.dispatchedCapability.canonicalEntityKind).toBe("campaign");
  });

  it("restricts the input schema to duplicable entity types", () => {
    expect(
      DuplicateEntityInputSchema.safeParse({ entityType: "campaign", entityId: "e" }).success
    ).toBe(true);
    expect(
      DuplicateEntityInputSchema.safeParse({ entityType: "creative", entityId: "e" }).success
    ).toBe(false);
  });
});

describe("TtdService.duplicateEntity create body", () => {
  it("POSTs only the allowlisted core settings (+ options), never the full GET payload", async () => {
    const { TtdService } = await import("../../src/services/ttd/ttd-service.js");
    const source = {
      CampaignId: "src-1",
      AdvertiserId: "adv-1",
      CampaignName: "Summer",
      Version: "Kokai",
      Budget: { Amount: 1000, CurrencyCode: "EUR" },
      StartDate: "2026-10-01T00:00:00",
      EndDate: "2026-12-31T00:00:00",
      PrimaryGoal: { MaximizeReach: true },
      PrimaryChannel: "Video",
      // Must NOT be echoed into the create body:
      Availability: "Available",
      CreatedAtUTC: "2026-01-01T00:00:00",
      LastModifiedAtUTC: "2026-01-02T00:00:00",
      CampaignFlights: [{ CampaignFlightId: 99, BudgetInAdvertiserCurrency: 1000 }],
      CtvTargetingAndAttribution: { deprecated: true },
    };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(source)
      .mockResolvedValueOnce({ CampaignId: "new-1" });
    const service = new TtdService(
      { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any,
      { consume: vi.fn().mockResolvedValue(undefined) } as any,
      { partnerId: "p", fetch, fetchDirect: vi.fn() } as any
    );

    await service.duplicateEntity("campaign", "src-1", { CampaignName: "Copy of Summer" });

    expect(fetch).toHaveBeenCalledTimes(2);
    const [path, , opts] = fetch.mock.calls[1];
    expect(path).toBe("/campaign");
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body)).toEqual({
      AdvertiserId: "adv-1",
      CampaignName: "Copy of Summer",
      Version: "Kokai",
      Budget: { Amount: 1000, CurrencyCode: "EUR" },
      StartDate: "2026-10-01T00:00:00",
      EndDate: "2026-12-31T00:00:00",
      PrimaryGoal: { MaximizeReach: true },
      PrimaryChannel: "Video",
    });
    // Only the campaign is created — no ad group is copied, so the copy cannot bid.
    expect(fetch.mock.calls.every(([p]) => !String(p).startsWith("/adgroup"))).toBe(true);
  });

  it("dry_run projects the same allowlisted body the execute path would POST", async () => {
    mockGetEntity.mockResolvedValue({
      CampaignId: "src-1",
      AdvertiserId: "adv-1",
      CampaignName: "Summer",
      Availability: "Available",
    });

    const result = await duplicateEntityLogic(
      { entityType: "campaign", entityId: "src-1", dry_run: true } as any,
      ctx,
      sdk
    );

    const post = result.dryRun?.expectedPostState;
    expect(post?.displayName).toBe("Summer");
    expect(post?.accountId).toBe("adv-1");
    // The source's status is not carried into the copy's create body.
    expect(post?.status.platformRaw).toBe("");
  });
});

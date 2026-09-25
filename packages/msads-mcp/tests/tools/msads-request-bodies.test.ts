// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Request path/body assertions derived from the Microsoft Advertising v13
 * Campaign Management docs (MicrosoftDocs/Advertising,
 * `advertising/bingads-13/campaign-management-service/`). Each tool runs
 * against a REAL MsAdsService over a mocked HTTP client so the exact request
 * that would reach Microsoft Ads is asserted.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import pino from "pino";

const { mockResolveSessionServices, mockElicitBulk, mockElicitStatus } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
  mockElicitBulk: vi.fn(),
  mockElicitStatus: vi.fn(),
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return {
    ...actual,
    elicitBulkMutationConfirmation: mockElicitBulk,
    elicitBulkStatusChangeConfirmation: mockElicitStatus,
  };
});

import type { RateLimiter } from "@cesteral/shared";
import { MsAdsService } from "../../src/services/msads/msads-service.js";
import type { MsAdsHttpClient } from "../../src/services/msads/msads-http-client.js";
import { updateEntityLogic } from "../../src/mcp-server/tools/definitions/update-entity.tool.js";
import { bulkCreateEntitiesLogic } from "../../src/mcp-server/tools/definitions/bulk-create-entities.tool.js";
import { bulkUpdateEntitiesLogic } from "../../src/mcp-server/tools/definitions/bulk-update-entities.tool.js";
import { bulkUpdateStatusLogic } from "../../src/mcp-server/tools/definitions/bulk-update-status.tool.js";
import { manageAdExtensionsLogic } from "../../src/mcp-server/tools/definitions/manage-ad-extensions.tool.js";
import { manageCriterionsLogic } from "../../src/mcp-server/tools/definitions/manage-criterions.tool.js";
import { importFromGoogleLogic } from "../../src/mcp-server/tools/definitions/import-from-google.tool.js";
import { validateEntityLogic } from "../../src/mcp-server/tools/definitions/validate-entity.tool.js";

const ctx = { requestId: "r" } as any;
const sdk = { sessionId: "s" } as any;

let http: {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  request: ReturnType<typeof vi.fn>;
};
let customer: { post: ReturnType<typeof vi.fn> };

beforeEach(() => {
  vi.clearAllMocks();
  http = {
    get: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
    request: vi.fn(),
  };
  http.request.mockImplementation(async (method: string, path: string, data: unknown) => {
    const verb = method.toLowerCase() as "post" | "put" | "delete";
    return http[verb](path, data);
  });
  customer = { post: vi.fn().mockResolvedValue({ Account: { CurrencyCode: "EUR" } }) };
  const rateLimiter = { consume: vi.fn().mockResolvedValue(undefined) } as unknown as RateLimiter;
  const msadsService = new MsAdsService(
    rateLimiter,
    http as unknown as MsAdsHttpClient,
    pino({ level: "silent" }),
    { userId: "u1", customerId: "c1" },
    { customerClient: customer as unknown as MsAdsHttpClient, accountId: "900" }
  );
  mockResolveSessionServices.mockReturnValue({ msadsService });
  mockElicitBulk.mockResolvedValue(true);
  mockElicitStatus.mockResolvedValue(true);
});

describe("msads_update_entity puts the parent ID in the Update body", () => {
  it.each([
    [
      "campaign",
      { accountId: "900" },
      "/Campaigns",
      { AccountId: 900, Campaigns: [{ Id: 1, Status: "Paused" }] },
    ],
    [
      "adGroup",
      { campaignId: "20" },
      "/AdGroups",
      { CampaignId: 20, AdGroups: [{ Id: 1, Status: "Paused" }] },
    ],
    ["ad", { adGroupId: "30" }, "/Ads", { AdGroupId: 30, Ads: [{ Id: 1, Status: "Paused" }] }],
    [
      "keyword",
      { adGroupId: "30" },
      "/Keywords",
      { AdGroupId: 30, Keywords: [{ Id: 1, Status: "Paused" }] },
    ],
    [
      "adExtension",
      { accountId: "900", adExtensionType: "SitelinkAdExtension" },
      "/AdExtensions",
      { AccountId: 900, AdExtensions: [{ Id: 1, Status: "Paused" }] },
    ],
    ["label", {}, "/Labels", { Labels: [{ Id: 1, Status: "Paused" }] }],
  ] as const)("%s → PUT %s with the documented body", async (entityType, parent, path, body) => {
    await updateEntityLogic(
      { entityType, entityId: "1", data: { Status: "Paused" }, ...parent } as any,
      ctx,
      sdk
    );
    expect(http.put).toHaveBeenCalledWith(path, body, ctx);
  });

  it("the before/after snapshots carry the account currency from GetAccount", async () => {
    http.post.mockResolvedValue({
      Campaigns: [{ Id: 1, Name: "C", Status: "Active", DailyBudget: 12.5 }],
    });
    const out = await updateEntityLogic(
      { entityType: "campaign", entityId: "1", accountId: "900", data: { Name: "D" } } as any,
      ctx,
      sdk
    );
    expect(out.before?.budget.daily).toEqual({ amountMinor: 1250, currency: "EUR" });
    expect(customer.post).toHaveBeenCalledWith("/Account/Query", { AccountId: 900 }, ctx);
  });

  it("the campaign read-back asks for every campaign type", async () => {
    await updateEntityLogic(
      { entityType: "campaign", entityId: "1", accountId: "900", data: { Name: "D" } } as any,
      ctx,
      sdk
    );
    const readBody = http.post.mock.calls.find((c) => c[0] === "/Campaigns/QueryByIds")?.[1];
    expect(readBody?.CampaignType).toBe(
      "Search, Shopping, DynamicSearchAds, Audience, Hotel, PerformanceMax, App"
    );
  });
});

describe("bulk tools send the parent ID in the request body", () => {
  it("bulk_create_entities (ad) → POST /Ads { AdGroupId, Ads }", async () => {
    await bulkCreateEntitiesLogic(
      { entityType: "ad", adGroupId: "30", items: [{ Type: "ResponsiveSearch" }] } as any,
      ctx,
      sdk
    );
    expect(http.post).toHaveBeenCalledWith(
      "/Ads",
      { AdGroupId: 30, Ads: [{ Type: "ResponsiveSearch" }] },
      ctx
    );
  });

  it("bulk_update_entities (adGroup) → PUT /AdGroups { CampaignId, AdGroups }", async () => {
    await bulkUpdateEntitiesLogic(
      { entityType: "adGroup", campaignId: "20", items: [{ Id: 5, Name: "n" }] } as any,
      ctx,
      sdk
    );
    expect(http.put).toHaveBeenCalledWith(
      "/AdGroups",
      { CampaignId: 20, AdGroups: [{ Id: 5, Name: "n" }] },
      ctx
    );
  });

  it("bulk_update_status (keyword) → PUT /Keywords { AdGroupId, Keywords }", async () => {
    await bulkUpdateStatusLogic(
      { entityType: "keyword", adGroupId: "30", entityIds: ["8"], status: "Paused" } as any,
      ctx,
      sdk
    );
    expect(http.put).toHaveBeenCalledWith(
      "/Keywords",
      { AdGroupId: 30, Keywords: [{ Id: 8, Status: "Paused" }] },
      ctx
    );
  });
});

describe("long-tail writes use the documented routes and surface PartialErrors", () => {
  const associations = {
    AccountId: 900,
    AssociationType: "Campaign",
    AdExtensionIdToEntityIdAssociations: [
      { AdExtensionId: 1, EntityId: 10 },
      { AdExtensionId: 2, EntityId: 10 },
    ],
  };

  it("setAssociations → POST /AdExtensionsAssociations/Set", async () => {
    const out = await manageAdExtensionsLogic(
      { operation: "setAssociations", data: associations } as any,
      ctx,
      sdk
    );
    expect(http.post).toHaveBeenCalledWith("/AdExtensionsAssociations/Set", associations);
    expect(out.effect?.summary).toMatchObject({ requested: 2, succeeded: 2, failed: 0 });
  });

  it("setAssociations throws when every association was rejected on an HTTP 200", async () => {
    http.post.mockResolvedValueOnce({
      PartialErrors: [
        { Index: 0, ErrorCode: "AdExtensionIdInvalid", Code: 1, Message: "invalid" },
        { Index: 1, ErrorCode: "AdExtensionIdInvalid", Code: 1, Message: "invalid" },
      ],
    });
    await expect(
      manageAdExtensionsLogic({ operation: "setAssociations", data: associations } as any, ctx, sdk)
    ).rejects.toThrow(/AdExtensionIdInvalid/);
  });

  it("deleteAssociations reports a partial success in the effect", async () => {
    http.delete.mockResolvedValueOnce({
      PartialErrors: [{ Index: 1, ErrorCode: "NotAssociated", Code: 2, Message: "no" }],
    });
    const out = await manageAdExtensionsLogic(
      { operation: "deleteAssociations", data: associations } as any,
      ctx,
      sdk
    );
    expect(out.effect?.summary).toMatchObject({
      requested: 2,
      succeeded: 1,
      failed: 1,
      partial_success: true,
    });
    expect(out.result?.itemFailures).toEqual([expect.objectContaining({ index: 1 })]);
  });

  it("manage_criterions add throws when NestedPartialErrors rejected the only criterion", async () => {
    http.post.mockResolvedValueOnce({
      CampaignCriterionIds: [null],
      NestedPartialErrors: [
        { Index: 0, BatchErrors: [{ ErrorCode: "InvalidLocation", Code: 5, Message: "bad" }] },
      ],
    });
    await expect(
      manageCriterionsLogic(
        {
          operation: "add",
          entityLevel: "campaign",
          data: { CampaignCriterions: [{ CampaignId: 1 }], CriterionType: "Location" },
        } as any,
        ctx,
        sdk
      )
    ).rejects.toThrow(/InvalidLocation/);
  });

  it("import_from_google create throws when the job id comes back null", async () => {
    http.post.mockResolvedValueOnce({
      ImportJobIds: [null],
      PartialErrors: [{ Index: 0, ErrorCode: "InvalidCredentialId", Code: 9, Message: "bad" }],
    });
    await expect(
      importFromGoogleLogic(
        {
          operation: "create",
          data: {
            ImportJobs: [
              { Type: "GoogleImportJob", Name: "n", GoogleAccountId: 1, CredentialId: "c" },
            ],
          },
        } as any,
        ctx,
        sdk
      )
    ).rejects.toThrow(/InvalidCredentialId/);
  });

  it("import_from_google getResults → POST /ImportResults/Query", async () => {
    const data = { ImportJobIds: [1], ImportType: "GoogleImportJob" };
    await importFromGoogleLogic({ operation: "getResults", data } as any, ctx, sdk);
    expect(http.post).toHaveBeenCalledWith("/ImportResults/Query", data);
  });
});

describe("msads_validate_entity enum rules match the v13 enumerations", () => {
  async function issuesFor(entityType: string, item: Record<string, unknown>) {
    const plural: Record<string, string> = {
      campaign: "Campaigns",
      adGroup: "AdGroups",
      ad: "Ads",
      keyword: "Keywords",
      budget: "Budgets",
    };
    const out = await validateEntityLogic(
      { entityType, mode: "create", data: { [plural[entityType]!]: [item] } } as any,
      ctx
    );
    return out.issues.filter((i) => i.code === "invalidValue");
  }

  it.each([
    ["campaign", { BudgetType: "LifetimeBudgetStandard" }],
    ["campaign", { CampaignType: "App" }],
    ["campaign", { CampaignType: "ObjectiveBased" }],
    ["adGroup", { Network: "InHousePromotion" }],
    ["ad", { Status: "Inactive" }],
    ["ad", { Type: "Image" }],
    ["ad", { Type: "Hotel" }],
    ["keyword", { Status: "Inactive" }],
  ] as const)("accepts documented %s value %j", async (entityType, item) => {
    expect(await issuesFor(entityType, item)).toEqual([]);
  });

  it.each([
    ["campaign", { BudgetType: "MonthlyBudgetSpendUntilDepleted" }],
    ["campaign", { CampaignType: "DisplayNetwork" }],
    ["adGroup", { Network: "ContentOnly" }],
    ["ad", { Status: "Disapproved" }],
    ["keyword", { MatchType: "Content" }],
    ["budget", { BudgetType: "DailyBudgetAccelerated" }],
  ] as const)("rejects undocumented %s value %j", async (entityType, item) => {
    expect(await issuesFor(entityType, item)).toHaveLength(1);
  });
});

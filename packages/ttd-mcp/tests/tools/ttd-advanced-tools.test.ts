import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockResolveSessionServices } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

vi.mock("../../src/mcp-server/tools/utils/entity-mapping.js", () => ({
  getEntityTypeEnum: vi
    .fn()
    .mockReturnValue([
      "advertiser",
      "campaign",
      "adGroup",
      "ad",
      "creative",
      "siteList",
      "deal",
      "conversionTracker",
      "bidList",
    ]),
  getBulkEntityTypeEnum: vi.fn().mockReturnValue(["campaign", "adGroup"]),
  getArchiveSupportedEntityTypes: vi.fn().mockReturnValue(["campaign", "adGroup"]),
  getEntityConfig: vi.fn().mockImplementation((entityType: string) => {
    if (entityType === "adGroup") {
      return {
        apiPath: "/adgroup",
        queryPath: "/adgroup/query/campaign",
        parentIds: ["advertiserId", "campaignId"],
        idField: "AdGroupId",
        supportsBulk: true,
        supportsArchive: true,
      };
    }
    if (entityType === "campaign") {
      return {
        apiPath: "/campaign",
        queryPath: "/campaign/query/advertiser",
        parentIds: ["advertiserId"],
        idField: "CampaignId",
        supportsBulk: true,
        supportsArchive: true,
      };
    }
    return {
      apiPath: `/${entityType}`,
      queryPath: `/${entityType}/query/advertiser`,
      parentIds: ["advertiserId"],
      idField: "Id",
    };
  }),
}));

vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return { ...actual, fetchWithTimeout: vi.fn() };
});

import { fetchWithTimeout } from "@cesteral/shared";
const mockFetchWithTimeout = vi.mocked(fetchWithTimeout);

import {
  bulkCreateEntitiesLogic,
  bulkCreateEntitiesResponseFormatter,
} from "../../src/mcp-server/tools/definitions/bulk-create-entities.tool.js";
import {
  bulkUpdateEntitiesLogic,
} from "../../src/mcp-server/tools/definitions/bulk-update-entities.tool.js";
import {
  archiveEntitiesLogic,
} from "../../src/mcp-server/tools/definitions/archive-entities.tool.js";
import {
  bulkUpdateStatusLogic,
} from "../../src/mcp-server/tools/definitions/bulk-update-status.tool.js";
import {
  graphqlQueryLogic,
  graphqlQueryResponseFormatter,
} from "../../src/mcp-server/tools/definitions/graphql-query.tool.js";
import {
  validateEntityLogic,
} from "../../src/mcp-server/tools/definitions/validate-entity.tool.js";
import { validateEntityResponseFormatter } from "@cesteral/shared";
import {
  downloadReportLogic,
  downloadReportResponseFormatter,
} from "../../src/mcp-server/tools/definitions/download-report.tool.js";

function createMockContext() {
  return {
    requestId: "req-123",
    timestamp: new Date().toISOString(),
    operation: "test",
  } as any;
}

function createMockSdkContext(sessionId = "session-123") {
  return { sessionId } as any;
}

describe("ttd advanced tools", () => {
  let mockTtdService: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockTtdService = {
      bulkCreateEntities: vi.fn().mockResolvedValue({
        results: [
          { success: true, entity: { CampaignId: "c1" } },
          { success: false, error: "Invalid" },
        ],
      }),
      bulkUpdateEntities: vi.fn().mockResolvedValue({
        results: [{ success: true, entity: { CampaignId: "c1" } }],
      }),
      archiveEntities: vi.fn().mockResolvedValue({
        results: [{ entityId: "c1", success: true }],
      }),
      bulkUpdateStatus: vi.fn().mockResolvedValue({
        results: [{ entityId: "ag1", success: true }],
      }),
      graphqlQuery: vi.fn().mockResolvedValue({
        data: { advertiser: { id: "a1" } },
        errors: [],
      }),
      testCreateOrUpdate: vi.fn().mockResolvedValue({ valid: true }),
      adjustBids: vi.fn(),
    };

    mockResolveSessionServices.mockReturnValue({
      ttdService: mockTtdService,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("bulkCreateEntitiesLogic returns aggregate counts", async () => {
    const result = await bulkCreateEntitiesLogic(
      {
        entityType: "campaign" as any,
        items: [{ CampaignName: "one" }, { CampaignName: "two" }],
      },
      createMockContext(),
      createMockSdkContext()
    );

    expect(result.totalRequested).toBe(2);
    expect(result.successCount).toBe(1);
    expect(result.failureCount).toBe(1);
    expect(mockTtdService.bulkCreateEntities).toHaveBeenCalledOnce();
  });

  it("bulkCreateEntitiesResponseFormatter includes summary", () => {
    const text = bulkCreateEntitiesResponseFormatter({
      entityType: "campaign",
      totalRequested: 2,
      successCount: 1,
      failureCount: 1,
      results: [{ success: true }, { success: false, error: "bad" }],
      timestamp: new Date().toISOString(),
    })[0].text;

    expect(text).toContain("Bulk create campaign: 1/2 succeeded, 1 failed");
  });

  it("bulkUpdateEntitiesLogic delegates to service", async () => {
    const result = await bulkUpdateEntitiesLogic(
      {
        entityType: "campaign" as any,
        items: [{ entityId: "c1", data: { CampaignName: "x" } }],
      },
      createMockContext(),
      createMockSdkContext()
    );

    expect(result.successCount).toBe(1);
    expect(mockTtdService.bulkUpdateEntities).toHaveBeenCalledOnce();
  });

  it("archiveEntitiesLogic returns per-entity outcome", async () => {
    const result = await archiveEntitiesLogic(
      {
        entityType: "campaign" as any,
        entityIds: ["c1"],
      },
      createMockContext(),
      createMockSdkContext()
    );

    expect(result.successCount).toBe(1);
    expect(result.results[0].entityId).toBe("c1");
  });

  it("bulkUpdateStatusLogic passes through target status", async () => {
    const result = await bulkUpdateStatusLogic(
      {
        entityType: "adGroup" as any,
        entityIds: ["ag1"],
        status: "Paused",
      },
      createMockContext(),
      createMockSdkContext()
    );

    expect(result.targetStatus).toBe("Paused");
    expect(mockTtdService.bulkUpdateStatus).toHaveBeenCalledWith(
      "adGroup",
      ["ag1"],
      "Paused",
      expect.any(Object)
    );
  });

  it("graphqlQueryLogic returns data + errors", async () => {
    const result = await graphqlQueryLogic(
      {
        query: "query { advertiser(id: \"a1\") { id } }",
        variables: { id: "a1" },
      },
      createMockContext(),
      createMockSdkContext()
    );

    expect(result.data).toEqual({ advertiser: { id: "a1" } });
    expect(mockTtdService.graphqlQuery).toHaveBeenCalledOnce();
  });

  it("graphqlQueryResponseFormatter includes GraphQL errors", () => {
    const text = graphqlQueryResponseFormatter({
      data: {},
      errors: [{ message: "bad query" }] as any,
      timestamp: new Date().toISOString(),
    })[0].text;

    expect(text).toContain("GraphQL Errors:");
    expect(text).toContain("bad query");
  });

  it("validateEntityLogic detects missing required fields (client-side)", async () => {
    const result = await validateEntityLogic(
      {
        entityType: "campaign" as any,
        mode: "create",
        data: {},
      },
      createMockContext(),
      createMockSdkContext()
    );

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.warnings).toBeDefined();
  });

  it("validateEntityResponseFormatter shows success and failure variants", () => {
    const okText = validateEntityResponseFormatter({
      valid: true,
      entityType: "campaign",
      mode: "create",
      errors: [],
      warnings: [],
      timestamp: new Date().toISOString(),
    })[0].text;
    expect(okText).toContain("Validation passed");

    const badText = validateEntityResponseFormatter({
      valid: false,
      entityType: "campaign",
      mode: "create",
      errors: ["Bad payload"],
      warnings: [],
      timestamp: new Date().toISOString(),
    })[0].text;
    expect(badText).toContain("Validation failed");
    expect(badText).toContain("Bad payload");
  });

  it("downloadReportLogic parses CSV and applies maxRows", async () => {
    mockResolveSessionServices.mockReturnValueOnce({});
    const csv = [
      "CampaignId,Impressions",
      "c1,100",
      "c2,200",
    ].join("\n");
    mockFetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      text: vi.fn().mockResolvedValue(csv),
    } as unknown as Response);

    const result = await downloadReportLogic(
      {
        downloadUrl: "https://example.com/report.csv",
        maxRows: 1,
      },
      createMockContext(),
      createMockSdkContext()
    );

    expect(result.totalRows).toBe(2);
    expect(result.returnedRows).toBe(1);
    expect(result.truncated).toBe(true);
    expect(result.rows[0]).toEqual({ CampaignId: "c1", Impressions: "100" });
    // Verify 60s timeout is used
    expect(mockFetchWithTimeout.mock.calls[0][1]).toBe(60_000);
  });

  it("downloadReportLogic throws when fetch fails", async () => {
    mockResolveSessionServices.mockReturnValueOnce({});
    mockFetchWithTimeout.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Server Error",
    } as unknown as Response);

    await expect(
      downloadReportLogic(
        { downloadUrl: "https://example.com/report.csv" },
        createMockContext(),
        createMockSdkContext()
      )
    ).rejects.toThrow("Failed to download report: 500 Server Error");
  });

  it("downloadReportResponseFormatter includes column summary", () => {
    const text = downloadReportResponseFormatter({
      totalRows: 2,
      returnedRows: 2,
      truncated: false,
      headers: ["CampaignId", "Impressions"],
      rows: [{ CampaignId: "c1", Impressions: "100" }],
      timestamp: new Date().toISOString(),
    })[0].text;

    expect(text).toContain("2 rows, 2 columns");
    expect(text).toContain("CampaignId, Impressions");
  });
});

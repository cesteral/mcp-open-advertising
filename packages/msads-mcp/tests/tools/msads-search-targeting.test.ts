import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@cesteral/shared", async () => {
  const actual = await vi.importActual("@cesteral/shared");
  return {
    ...actual,
    resolveSessionServicesFromStore: vi.fn(),
  };
});

import { resolveSessionServicesFromStore } from "@cesteral/shared";
const mockResolveSession = vi.mocked(resolveSessionServicesFromStore);

import { searchTargetingLogic } from "../../src/mcp-server/tools/definitions/search-targeting.tool.js";
import type { SessionServices } from "../../src/services/session-services.js";

function createMockServices(): SessionServices {
  return {
    msadsService: {
      listEntities: vi.fn(),
      getEntity: vi.fn(),
      createEntity: vi.fn(),
      updateEntity: vi.fn(),
      deleteEntity: vi.fn(),
      bulkCreateEntities: vi.fn(),
      bulkUpdateEntities: vi.fn(),
      bulkUpdateStatus: vi.fn(),
      adjustBids: vi.fn(),
      executeOperation: vi.fn(),
      executeReadOperation: vi.fn().mockResolvedValue({
        Locations: [{ Id: 190, Name: "New York", Type: "City" }],
      }),
    } as any,
    msadsReportingService: {} as any,
  };
}

describe("msads_search_targeting", () => {
  let mockServices: SessionServices;

  beforeEach(() => {
    vi.clearAllMocks();
    mockServices = createMockServices();
    mockResolveSession.mockReturnValue(mockServices);
  });

  it("routes location search through executeReadOperation (not executeOperation)", async () => {
    const result = await searchTargetingLogic(
      { targetingType: "location", query: "New York", maxResults: 25 },
      { requestId: "req-1" }
    );

    expect(mockServices.msadsService.executeReadOperation).toHaveBeenCalledWith(
      "/LocationTarget/Search",
      { Query: "New York", MaxResults: 25 },
      { requestId: "req-1" }
    );
    expect(mockServices.msadsService.executeOperation).not.toHaveBeenCalled();
    expect(result.results).toHaveLength(1);
    expect(result.targetingType).toBe("location");
  });

  it("returns static age ranges without API call", async () => {
    const result = await searchTargetingLogic(
      { targetingType: "age", maxResults: 25 },
      { requestId: "req-2" }
    );

    expect(mockServices.msadsService.executeReadOperation).not.toHaveBeenCalled();
    expect(mockServices.msadsService.executeOperation).not.toHaveBeenCalled();
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.targetingType).toBe("age");
  });

  it("throws when location search has no query", async () => {
    await expect(
      searchTargetingLogic(
        { targetingType: "location", maxResults: 25 },
        { requestId: "req-3" }
      )
    ).rejects.toThrow("query is required");
  });
});

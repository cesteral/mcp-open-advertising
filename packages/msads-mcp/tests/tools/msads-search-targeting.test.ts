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
      executeReadOperation: vi.fn(),
    } as any,
    msadsCustomerService: {} as any,
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

  it("returns static age ranges without API call", async () => {
    const result = await searchTargetingLogic(
      { targetingType: "age", maxResults: 25 },
      { requestId: "req-1" }
    );

    expect(mockServices.msadsService.executeReadOperation).not.toHaveBeenCalled();
    expect(mockServices.msadsService.executeOperation).not.toHaveBeenCalled();
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.targetingType).toBe("age");
  });

  it("returns static genders without API call", async () => {
    const result = await searchTargetingLogic(
      { targetingType: "gender", maxResults: 25 },
      { requestId: "req-2" }
    );

    expect(result.results.length).toBeGreaterThan(0);
    expect(result.targetingType).toBe("gender");
  });

  it("returns static device types without API call", async () => {
    const result = await searchTargetingLogic(
      { targetingType: "device", maxResults: 25 },
      { requestId: "req-3" }
    );

    expect(result.results.length).toBeGreaterThan(0);
    expect(result.targetingType).toBe("device");
  });
});

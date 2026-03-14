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

import { listEntitiesLogic, listEntitiesResponseFormatter } from "../../src/mcp-server/tools/definitions/list-entities.tool.js";
import type { SessionServices } from "../../src/services/session-services.js";

function createMockServices(): SessionServices {
  return {
    msadsService: {
      listEntities: vi.fn().mockResolvedValue({
        Campaigns: [
          { Id: 1, Name: "Campaign A" },
          { Id: 2, Name: "Campaign B" },
        ],
      }),
      getEntity: vi.fn(),
      createEntity: vi.fn(),
      updateEntity: vi.fn(),
      deleteEntity: vi.fn(),
      bulkCreateEntities: vi.fn(),
      bulkUpdateEntities: vi.fn(),
      bulkUpdateStatus: vi.fn(),
      adjustBids: vi.fn(),
      executeOperation: vi.fn(),
    } as any,
    msadsReportingService: {} as any,
  };
}

describe("msads_list_entities", () => {
  let mockServices: SessionServices;

  beforeEach(() => {
    vi.clearAllMocks();
    mockServices = createMockServices();
    mockResolveSession.mockReturnValue(mockServices);
  });

  it("lists campaigns by account ID", async () => {
    const result = await listEntitiesLogic(
      { entityType: "campaign", accountId: "123" },
      { requestId: "req-1" }
    );

    expect(result.entities).toHaveLength(2);
    expect(result.entityType).toBe("campaign");
    expect(result.count).toBe(2);
    expect(mockServices.msadsService.listEntities).toHaveBeenCalledWith(
      "campaign",
      { accountId: "123", parentId: undefined, filters: undefined },
      { requestId: "req-1" }
    );
  });

  it("lists adGroups by parent ID", async () => {
    (mockServices.msadsService.listEntities as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      AdGroups: [{ Id: 10 }],
    });

    const result = await listEntitiesLogic(
      { entityType: "adGroup", parentId: "camp-1" },
      { requestId: "req-2" }
    );

    expect(result.entities).toHaveLength(1);
    expect(result.entityType).toBe("adGroup");
  });

  it("returns empty when no entities", async () => {
    (mockServices.msadsService.listEntities as ReturnType<typeof vi.fn>).mockResolvedValueOnce({});

    const result = await listEntitiesLogic(
      { entityType: "budget", accountId: "123" },
      { requestId: "req-3" }
    );

    expect(result.entities).toHaveLength(0);
    expect(result.count).toBe(0);
  });

  it("formats response correctly", () => {
    const output = {
      entities: [{ Id: 1, Name: "Test" }],
      entityType: "campaign",
      count: 1,
      timestamp: new Date().toISOString(),
    };

    const formatted = listEntitiesResponseFormatter(output);
    expect(formatted).toHaveLength(1);
    expect(formatted[0]!.type).toBe("text");
    expect(formatted[0]!.text).toContain("Found 1 campaign entities");
  });
});

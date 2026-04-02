import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockResolveSessionServices } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

import {
  executeEntityReportLogic,
} from "../../src/mcp-server/tools/definitions/execute-entity-report.tool.js";
import {
  getEntityReportTypesLogic,
} from "../../src/mcp-server/tools/definitions/get-entity-report-types.tool.js";

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

describe("ttd entity report tools", () => {
  let mockTtdService: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockTtdService = {
      executeEntityReport: vi.fn(),
      getEntityReportMetadata: vi.fn(),
    };

    mockResolveSessionServices.mockReturnValue({
      ttdService: mockTtdService,
    });
  });

  it("surfaces top-level GraphQL errors when fetching entity report types", async () => {
    mockTtdService.getEntityReportMetadata.mockResolvedValueOnce({
      errors: [
        {
          message: "Tile does not exist",
          extensions: { code: "GRAPHQL_VALIDATION_FAILED" },
        },
      ],
    });

    await expect(
      getEntityReportTypesLogic(
        { entityType: "advertiser", entityId: "adv-1", tile: "BadTile" },
        createMockContext(),
        createMockSdkContext()
      )
    ).rejects.toThrow("GraphQL error retrieving entity report types: Tile does not exist");
  });

  it("surfaces top-level GraphQL errors when executing an entity report", async () => {
    mockTtdService.executeEntityReport.mockResolvedValueOnce({
      errors: [
        {
          message: "Unknown report type",
          extensions: { code: "GRAPHQL_VALIDATION_FAILED" },
        },
      ],
    });

    await expect(
      executeEntityReportLogic(
        { entityType: "campaign", entityId: "camp-1", reportType: "BAD_REPORT" },
        createMockContext(),
        createMockSdkContext()
      )
    ).rejects.toThrow("GraphQL error executing entity report: Unknown report type");
  });
});

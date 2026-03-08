import { beforeEach, describe, expect, it, vi } from "vitest";

const tiktokService = {
  listEntities: vi.fn(async () => ({
    entities: [{ campaign_id: "123" }],
    pageInfo: { page: 1, page_size: 10, total_number: 1, total_page: 1 },
  })),
  getEntity: vi.fn(async () => ({ campaign_id: "123" })),
  createEntity: vi.fn(async () => ({ campaign_id: "new" })),
  updateEntity: vi.fn(async () => ({})),
  deleteEntity: vi.fn(async () => ({})),
  listAdvertisers: vi.fn(async () => ({ list: [{ advertiser_id: "123" }] })),
  bulkUpdateStatus: vi.fn(async (_entityType: string, entityIds: string[]) => ({
    results: entityIds.map((entityId) => ({ entityId, success: true })),
  })),
  bulkCreateEntities: vi.fn(async (_entityType: string, items: unknown[]) => ({
    results: items.map(() => ({ success: true, entity: { id: "new" } })),
  })),
  bulkUpdateEntities: vi.fn(async (_entityType: string, items: Array<{ entityId: string }>) => ({
    results: items.map((item) => ({ entityId: item.entityId, success: true })),
  })),
  adjustBids: vi.fn(async (adjustments: Array<{ adGroupId: string }>) => ({
    results: adjustments.map((a) => ({ adGroupId: a.adGroupId, success: true, newBid: 1 })),
  })),
  searchTargeting: vi.fn(async () => ({ list: [{ id: "targeting-1" }] })),
  getTargetingOptions: vi.fn(async () => ({ list: [{ id: "targeting-option-1" }] })),
  duplicateEntity: vi.fn(async () => ({ id: "copy" })),
  getAudienceEstimate: vi.fn(async () => ({ audience_size: 1000 })),
  getAdPreviews: vi.fn(async () => ({ previews: [{ html: "<div></div>" }] })),
};

const tiktokReportingService = {
  getReport: vi.fn(async () => ({
    headers: ["date", "impressions"],
    rows: [["2026-03-01", "100"]],
    totalRows: 1,
    taskId: "task-123",
  })),
  getReportBreakdowns: vi.fn(async () => ({
    headers: ["date", "impressions", "country"],
    rows: [["2026-03-01", "100", "US"]],
    totalRows: 1,
    taskId: "task-456",
  })),
  submitReport: vi.fn(async () => ({ task_id: "task-submit-1" })),
  checkReportStatus: vi.fn(async () => ({
    taskId: "task-check-1",
    status: "DONE",
    downloadUrl: "https://example.com/report.csv",
  })),
  downloadReport: vi.fn(async () => ({
    headers: ["date", "impressions"],
    rows: [["2026-03-01", "100"]],
    totalRows: 1,
  })),
};

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: () => ({ tiktokService, tiktokReportingService }),
}));

import { allTools } from "../../src/mcp-server/tools/definitions/index.js";
import { allResources } from "../../src/mcp-server/resources/definitions/index.js";
import { getAllPrompts, getPromptDefinition, promptRegistry } from "../../src/mcp-server/prompts/index.js";

describe("TikTok MCP definitions coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exposes expected definitions", () => {
    expect(allTools).toHaveLength(27); // 21 business tools + 6 conformance tools
    expect(allResources.length).toBeGreaterThan(4);
    expect(getAllPrompts()).toHaveLength(10);
    expect(promptRegistry.size).toBe(10);
    expect(getPromptDefinition("tiktok_campaign_setup_workflow")).toBeDefined();
  });

  it("executes every tool logic and formatter using example inputs", async () => {
    const sdkContext = { sessionId: "test-session" } as any;
    const requestContext = { requestId: "req-123" } as any;

    for (const tool of allTools) {
      const example = tool.inputExamples?.[0]?.input;
      expect(example, `${tool.name} should have at least one input example`).toBeDefined();

      const parsedInput = tool.inputSchema.parse(example);
      const result = await tool.logic(parsedInput as never, requestContext, sdkContext);

      if (tool.outputSchema) {
        const parsedOutput = tool.outputSchema.parse(result);
        expect(parsedOutput).toBeDefined();
      }

      if (tool.responseFormatter) {
        const formatted = tool.responseFormatter(result as never, parsedInput as never);
        expect(Array.isArray(formatted)).toBe(true);
      }
    }

    expect(tiktokService.listEntities).toHaveBeenCalled();
    expect(tiktokService.createEntity).toHaveBeenCalled();
    expect(tiktokService.adjustBids).toHaveBeenCalled();
    expect(tiktokReportingService.getReport).toHaveBeenCalled();
    expect(tiktokReportingService.getReportBreakdowns).toHaveBeenCalled();
  });

  it("generates prompt messages", () => {
    const campaignPrompt = getPromptDefinition("tiktok_campaign_setup_workflow");
    const bulkPrompt = getPromptDefinition("tiktok_bulk_operations_workflow");

    expect(campaignPrompt?.generateMessage({ advertiserId: "123" })).toContain("TikTok");
    expect(bulkPrompt?.generateMessage({ entityType: "campaign" })).toContain("bulk");
  });
});

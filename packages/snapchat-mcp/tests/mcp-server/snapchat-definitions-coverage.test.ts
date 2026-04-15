import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return {
    ...actual,
    downloadFileToBuffer: vi.fn(async () => ({
      buffer: Buffer.from("fake-file-content"),
      contentType: "image/jpeg",
      filename: "test-image.jpg",
    })),
  };
});

const snapchatService = {
  listEntities: vi.fn(async () => ({
    entities: [{ id: "123", name: "Test Campaign" }],
    nextCursor: undefined,
  })),
  getEntity: vi.fn(async () => ({ campaign_id: "123" })),
  createEntity: vi.fn(async () => ({ campaign_id: "new" })),
  updateEntity: vi.fn(async () => ({})),
  deleteEntity: vi.fn(async () => ({})),
  listAdAccounts: vi.fn(async () => ({ entities: [{ ad_account_id: "123" }], nextCursor: undefined })),
  bulkUpdateStatus: vi.fn(async (_entityType: string, _filters: unknown, entityIds: string[]) => ({
    results: entityIds.map((entityId) => ({ entityId, success: true })),
  })),
  bulkCreateEntities: vi.fn(async (_entityType: string, _filters: unknown, items: unknown[]) => ({
    results: items.map(() => ({ success: true, entity: { id: "new" } })),
  })),
  bulkUpdateEntities: vi.fn(async (_entityType: string, _filters: unknown, items: Array<{ entityId: string }>) => ({
    results: items.map((item) => ({ entityId: item.entityId, success: true })),
  })),
  adjustBids: vi.fn(async (adjustments: Array<{ adGroupId: string }>) => ({
    results: adjustments.map((a) => ({ adGroupId: a.adGroupId, success: true, newBid: 1 })),
  })),
  searchTargeting: vi.fn(async () => ({ results: [{ id: "targeting-1" }] })),
  getTargetingOptions: vi.fn(async () => ({ results: [{ id: "targeting-option-1" }] })),
  getAudienceEstimate: vi.fn(async () => ({ audience_size: 1000 })),
  getCreativePreview: vi.fn(async () => ({ creative_preview_link: "https://ad-preview.snapchat.com/?creative_id=123" })),
  client: {
    post: vi.fn(async () => ({
      media: [{ media: { id: "media-test-123", media_status: "PENDING" } }],
    })),
    postMultipart: vi.fn(async () => ({ request_status: "SUCCESS" })),
    get: vi.fn(async () => ({
      media: [{ media: { id: "media-test-123", media_status: "READY" } }],
    })),
  },
};

const snapchatReportingService = {
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
    status: "COMPLETE",
    downloadUrl: "https://example.com/report.csv",
  })),
  downloadReport: vi.fn(async () => ({
    headers: ["date", "impressions"],
    rows: [["2026-03-01", "100"]],
    totalRows: 1,
  })),
};

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: () => ({ snapchatService, snapchatReportingService }),
}));

import { allTools } from "../../src/mcp-server/tools/definitions/index.js";
import { allResources } from "../../src/mcp-server/resources/definitions/index.js";
import { getAllPrompts, getPromptDefinition, promptRegistry } from "../../src/mcp-server/prompts/index.js";

describe("Snapchat MCP definitions coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("exposes expected definitions", () => {
    const conformanceEnabled = process.env.MCP_INCLUDE_CONFORMANCE_TOOLS === "true";
    expect(allTools).toHaveLength(conformanceEnabled ? 28 : 22); // 22 business + 6 conformance when enabled
    expect(allResources.length).toBeGreaterThan(4);
    expect(getAllPrompts()).toHaveLength(10);
    expect(promptRegistry.size).toBe(10);
    expect(getPromptDefinition("snapchat_campaign_setup_workflow")).toBeDefined();
  });

  it("executes every tool logic and formatter using example inputs", async () => {
    const sdkContext = { sessionId: "test-session" } as any;
    const requestContext = { requestId: "req-123" } as any;

    for (const tool of allTools) {
      const example = tool.inputExamples?.[0]?.input;
      expect(example, `${tool.name} should have at least one input example`).toBeDefined();

      const parsedInput = tool.inputSchema.parse(example);
      // Run logic concurrently with timer advancement to handle any sleep() calls in upload polling
      const [result] = await Promise.all([
        tool.logic(parsedInput as never, requestContext, sdkContext),
        vi.runAllTimersAsync(),
      ]);

      if (tool.outputSchema) {
        const parsedOutput = tool.outputSchema.parse(result);
        expect(parsedOutput).toBeDefined();
      }

      if (tool.responseFormatter) {
        const formatted = tool.responseFormatter(result as never, parsedInput as never);
        expect(Array.isArray(formatted)).toBe(true);
      }
    }

    expect(snapchatService.listEntities).toHaveBeenCalled();
    expect(snapchatService.createEntity).toHaveBeenCalled();
    expect(snapchatService.adjustBids).toHaveBeenCalled();
    expect(snapchatReportingService.getReport).toHaveBeenCalled();
    expect(snapchatReportingService.getReportBreakdowns).toHaveBeenCalled();
  });

  it("generates prompt messages", () => {
    const campaignPrompt = getPromptDefinition("snapchat_campaign_setup_workflow");
    const bulkPrompt = getPromptDefinition("snapchat_bulk_operations_workflow");

    expect(campaignPrompt?.generateMessage({ adAccountId: "123" })).toContain("Snapchat");
    expect(bulkPrompt?.generateMessage({ entityType: "campaign" })).toContain("bulk");
  });
});

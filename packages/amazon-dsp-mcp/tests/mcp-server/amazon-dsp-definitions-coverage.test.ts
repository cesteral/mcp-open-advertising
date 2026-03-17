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

const amazonDspService = {
  listEntities: vi.fn(async () => ({
    entities: [{ orderId: "ord_123" }],
    pageInfo: { startIndex: 0, count: 25, totalResults: 1 },
  })),
  getEntity: vi.fn(async () => ({ orderId: "ord_123" })),
  createEntity: vi.fn(async () => ({ orders: [{ orderId: "ord_new" }] })),
  updateEntity: vi.fn(async () => ({})),
  deleteEntity: vi.fn(async () => ({})),
  listAdvertisers: vi.fn(async () => ({ entities: [{ advertiserId: "adv_123", name: "Test Advertiser" }], pageInfo: { startIndex: 0, count: 25, totalResults: 1 } })),
  bulkUpdateStatus: vi.fn(async (_entityType: string, entityIds: string[]) => ({
    results: entityIds.map((entityId) => ({ entityId, success: true })),
  })),
  bulkCreateEntities: vi.fn(async (_entityType: string, items: unknown[]) => ({
    results: items.map(() => ({ success: true, entity: { id: "new" } })),
  })),
  bulkUpdateEntities: vi.fn(async (_entityType: string, items: Array<{ entityId: string }>) => ({
    results: items.map((item) => ({ entityId: item.entityId, success: true })),
  })),
  adjustBids: vi.fn(async (adjustments: Array<{ lineItemId: string }>) => ({
    results: adjustments.map((a) => ({ lineItemId: a.lineItemId, success: true, newBid: 1 })),
  })),
  searchTargeting: vi.fn(async () => ({ list: [{ id: "targeting-1" }] })),
  getTargetingOptions: vi.fn(async () => ({ list: [{ id: "targeting-option-1" }] })),
  duplicateEntity: vi.fn(async () => ({ id: "copy" })),
  getAudienceEstimate: vi.fn(async () => ({ audienceSize: 1000 })),
  getAdPreviews: vi.fn(async () => ({ previews: [{ html: "<div></div>" }] })),
  client: {
    postMultipart: vi.fn(async (path: string) => {
      if (path.includes("image")) {
        return { image_id: "img-test-123", image_url: "https://example.com/img.jpg", size: 1000 };
      }
      return { video_id: "vid-test-123", video_name: "Test Video" };
    }),
    post: vi.fn(async () => ({
      list: [{ video_id: "vid-test-123", video_status: "bind_success", video_name: "Test Video", duration: 15 }],
    })),
  },
};

const amazonDspReportingService = {
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
  resolveSessionServices: () => ({ amazonDspService, amazonDspReportingService }),
}));

import { allTools } from "../../src/mcp-server/tools/definitions/index.js";
import { allResources } from "../../src/mcp-server/resources/definitions/index.js";
import { getAllPrompts, getPromptDefinition, promptRegistry } from "../../src/mcp-server/prompts/index.js";

describe("Amazon DSP MCP definitions coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("exposes expected definitions", () => {
    const conformanceEnabled = process.env.MCP_INCLUDE_CONFORMANCE_TOOLS === "true";
    expect(allTools).toHaveLength(conformanceEnabled ? 26 : 20); // 20 business + 6 conformance when enabled
    expect(allResources.length).toBeGreaterThan(4);
    expect(getAllPrompts()).toHaveLength(11);
    expect(promptRegistry.size).toBe(11);
    expect(getPromptDefinition("amazon_dsp_campaign_setup_workflow")).toBeDefined();
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

    expect(amazonDspService.listEntities).toHaveBeenCalled();
    expect(amazonDspService.createEntity).toHaveBeenCalled();
    expect(amazonDspService.adjustBids).toHaveBeenCalled();
    expect(amazonDspReportingService.getReport).toHaveBeenCalled();
    expect(amazonDspReportingService.getReportBreakdowns).toHaveBeenCalled();
  });

  it("generates prompt messages", () => {
    const campaignPrompt = getPromptDefinition("amazon_dsp_campaign_setup_workflow");
    const bulkPrompt = getPromptDefinition("amazon_dsp_bulk_operations_workflow");

    expect(campaignPrompt?.generateMessage({ profileId: "123" })).toContain("Amazon DSP");
    expect(bulkPrompt?.generateMessage({ entityType: "campaign" })).toContain("bulk");
  });
});

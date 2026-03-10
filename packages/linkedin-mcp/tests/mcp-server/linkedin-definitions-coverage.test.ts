import { beforeEach, describe, expect, it, vi } from "vitest";

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

const linkedInService = {
  listEntities: vi.fn(async () => ({ entities: [{ id: "urn:li:test:1" }], total: 1, start: 0 })),
  getEntity: vi.fn(async () => ({ id: "urn:li:test:1" })),
  createEntity: vi.fn(async () => ({ id: "urn:li:test:new" })),
  updateEntity: vi.fn(async () => ({})),
  deleteEntity: vi.fn(async () => ({})),
  listAdAccounts: vi.fn(async () => ({ accounts: [{ id: "urn:li:sponsoredAccount:1" }], total: 1 })),
  bulkUpdateStatus: vi.fn(async (entityType: string, entityUrns: string[]) => ({
    results: entityUrns.map((entityUrn: string) => ({ entityUrn, success: true })),
  })),
  bulkCreateEntities: vi.fn(async (_entityType: string, items: unknown[]) => ({
    results: items.map(() => ({ success: true, entity: { id: "urn:li:test:new" } })),
  })),
  bulkUpdateEntities: vi.fn(async (_entityType: string, items: Array<{ entityUrn: string }>) => ({
    results: items.map((item) => ({ entityUrn: item.entityUrn, success: true })),
  })),
  adjustBids: vi.fn(async (adjustments: Array<{ campaignUrn: string }>) => ({
    results: adjustments.map((a) => ({ campaignUrn: a.campaignUrn, success: true })),
  })),
  searchTargeting: vi.fn(async () => ({ elements: [{ id: "targeting-1" }] })),
  getTargetingOptions: vi.fn(async () => ({ elements: [{ id: "targeting-option-1" }] })),
  duplicateEntity: vi.fn(async () => ({ id: "urn:li:test:copy" })),
  getDeliveryForecast: vi.fn(async () => ({ forecast: { impressions: 1000 } })),
  getAdPreviews: vi.fn(async () => ({ previews: [{ preview: "<html></html>" }] })),
  client: {
    post: vi.fn(async () => ({
      value: {
        uploadMechanism: {
          "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest": {
            uploadUrl: "https://example.com/upload",
          },
        },
        asset: "urn:li:digitalmediaAsset:test123",
      },
    })),
    putBinary: vi.fn(async () => undefined),
  },
};

const linkedInReportingService = {
  getAnalytics: vi.fn(async () => ({ elements: [{ impressions: 100 }], paging: { total: 1 } })),
  getAnalyticsBreakdowns: vi.fn(async () => ({
    results: [{ pivot: "CAMPAIGN", elements: [{ impressions: 100 }] }],
  })),
};

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: () => ({ linkedInService, linkedInReportingService }),
}));

import { allTools } from "../../src/mcp-server/tools/definitions/index.js";
import { allResources } from "../../src/mcp-server/resources/definitions/index.js";
import { getAllPrompts, getPromptDefinition, promptRegistry } from "../../src/mcp-server/prompts/index.js";

describe("LinkedIn MCP definitions coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exposes expected definitions", () => {
    const conformanceEnabled = process.env.MCP_INCLUDE_CONFORMANCE_TOOLS === "true";
    expect(allTools).toHaveLength(conformanceEnabled ? 25 : 19); // 19 business + 6 conformance when enabled
    expect(allResources.length).toBeGreaterThan(4);
    expect(getAllPrompts()).toHaveLength(11);
    expect(promptRegistry.size).toBe(11);
    expect(getPromptDefinition("linkedin_campaign_setup_workflow")).toBeDefined();
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

    expect(linkedInService.listEntities).toHaveBeenCalled();
    expect(linkedInService.createEntity).toHaveBeenCalled();
    expect(linkedInService.adjustBids).toHaveBeenCalled();
    expect(linkedInReportingService.getAnalytics).toHaveBeenCalled();
    expect(linkedInReportingService.getAnalyticsBreakdowns).toHaveBeenCalled();
  });

  it("generates prompt messages", () => {
    const campaignPrompt = getPromptDefinition("linkedin_campaign_setup_workflow");
    const bulkPrompt = getPromptDefinition("linkedin_bulk_operations_workflow");

    expect(campaignPrompt?.generateMessage({ adAccountUrn: "urn:li:sponsoredAccount:1" })).toContain("LinkedIn");
    expect(bulkPrompt?.generateMessage({ entityType: "campaign" })).toContain("bulk");
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockResolveSessionServices } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

import {
  graphqlQueryBulkLogic,
  graphqlQueryBulkResponseFormatter,
  GraphqlQueryBulkInputSchema,
} from "../../src/mcp-server/tools/definitions/graphql-query-bulk.tool.js";
import {
  graphqlMutationBulkLogic,
  graphqlMutationBulkResponseFormatter,
  GraphqlMutationBulkInputSchema,
} from "../../src/mcp-server/tools/definitions/graphql-mutation-bulk.tool.js";
import {
  graphqlBulkJobLogic,
  graphqlBulkJobResponseFormatter,
} from "../../src/mcp-server/tools/definitions/graphql-bulk-job.tool.js";
import {
  graphqlCancelBulkJobLogic,
  graphqlCancelBulkJobResponseFormatter,
} from "../../src/mcp-server/tools/definitions/graphql-cancel-bulk-job.tool.js";

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

describe("ttd graphql bulk tools", () => {
  let mockTtdService: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockTtdService = {
      graphqlQuery: vi.fn(),
    };

    mockResolveSessionServices.mockReturnValue({
      ttdService: mockTtdService,
    });
  });

  // ── createQueryBulk ──

  describe("graphqlQueryBulkLogic", () => {
    it("passes query + variables and returns jobId + status", async () => {
      mockTtdService.graphqlQuery.mockResolvedValueOnce({
        data: {
          createQueryBulk: { jobId: "job-q1", status: "Queued" },
        },
      });

      const result = await graphqlQueryBulkLogic(
        {
          query: "query Adv($id: ID!) { advertiser(id: $id) { name } }",
          variables: [{ id: "adv1" }, { id: "adv2" }],
        },
        createMockContext(),
        createMockSdkContext()
      );

      expect(result.jobId).toBe("job-q1");
      expect(result.status).toBe("Queued");
      expect(result.timestamp).toBeDefined();
      expect(mockTtdService.graphqlQuery).toHaveBeenCalledWith(
        expect.stringContaining("createQueryBulk"),
        {
          input: {
            query: expect.any(String),
            variables: [{ id: "adv1" }, { id: "adv2" }],
          },
        },
        expect.any(Object)
      );
    });

    it("validates non-empty variables array", () => {
      const result = GraphqlQueryBulkInputSchema.safeParse({
        query: "query { foo }",
        variables: [],
      });

      expect(result.success).toBe(false);
    });

    it("throws when TTD returns top-level GraphQL errors", async () => {
      mockTtdService.graphqlQuery.mockResolvedValueOnce({
        errors: [{ message: "RESOURCE_LIMIT_EXCEEDED" }],
      });

      await expect(
        graphqlQueryBulkLogic(
          {
            query: "query Adv($id: ID!) { advertiser(id: $id) { name } }",
            variables: [{ id: "adv1" }],
          },
          createMockContext(),
          createMockSdkContext()
        )
      ).rejects.toThrow("TTD GraphQL bulk request failed");
    });
  });

  // ── createMutationBulk ──

  describe("graphqlMutationBulkLogic", () => {
    it("passes mutation + inputs and returns jobId + status", async () => {
      mockTtdService.graphqlQuery.mockResolvedValueOnce({
        data: {
          createMutationBulk: { jobId: "job-m1", status: "Queued" },
        },
      });

      const result = await graphqlMutationBulkLogic(
        {
          mutation: "mutation Update($input: UpdateInput!) { update(input: $input) { id } }",
          inputs: [{ id: "c1", name: "New" }],
        },
        createMockContext(),
        createMockSdkContext()
      );

      expect(result.jobId).toBe("job-m1");
      expect(result.status).toBe("Queued");
      expect(mockTtdService.graphqlQuery).toHaveBeenCalledWith(
        expect.stringContaining("createMutationBulk"),
        {
          input: {
            mutation: expect.any(String),
            inputs: [{ id: "c1", name: "New" }],
          },
        },
        expect.any(Object)
      );
    });

    it("rejects > 1000 inputs", () => {
      const inputs = Array.from({ length: 1001 }, (_, i) => ({ id: `e${i}` }));
      const result = GraphqlMutationBulkInputSchema.safeParse({
        mutation: "mutation { foo }",
        inputs,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const maxIssue = result.error.issues.find(
          (i) => i.code === "too_big" || i.message.includes("1000")
        );
        expect(maxIssue).toBeDefined();
      }
    });

    it("rejects mutation string > 60,000 chars (token limit proxy)", () => {
      const longMutation = "mutation { " + "x".repeat(60_001) + " }";
      const result = GraphqlMutationBulkInputSchema.safeParse({
        mutation: longMutation,
        inputs: [{ id: "e1" }],
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const tokenIssue = result.error.issues.find((i) =>
          i.message.includes("15,000")
        );
        expect(tokenIssue).toBeDefined();
      }
    });

    it("response formatter includes non-cancelable warning", () => {
      const text = graphqlMutationBulkResponseFormatter({
        jobId: "job-m1",
        status: "Queued",
        timestamp: new Date().toISOString(),
      })[0].text;

      expect(text).toContain("NON-CANCELABLE");
      expect(text).toContain("job-m1");
    });

    it("throws when TTD returns top-level GraphQL errors", async () => {
      mockTtdService.graphqlQuery.mockResolvedValueOnce({
        errors: [{ message: "VALIDATION_FAILURE" }],
      });

      await expect(
        graphqlMutationBulkLogic(
          {
            mutation: "mutation Update($input: UpdateInput!) { update(input: $input) { id } }",
            inputs: [{ id: "c1", name: "New" }],
          },
          createMockContext(),
          createMockSdkContext()
        )
      ).rejects.toThrow("TTD GraphQL bulk mutation failed");
    });
  });

  // ── bulkJob ──

  describe("graphqlBulkJobLogic", () => {
    it("returns full job status with progress and resultUrl", async () => {
      mockTtdService.graphqlQuery.mockResolvedValueOnce({
        data: {
          bulkJob: {
            jobId: "job-q1",
            status: "Complete",
            resultUrl: "https://results.ttd.com/job-q1.csv",
            resultExpiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
            progress: { completed: 100, total: 100 },
          },
        },
      });

      const result = await graphqlBulkJobLogic(
        { jobId: "job-q1" },
        createMockContext(),
        createMockSdkContext()
      );

      expect(result.jobId).toBe("job-q1");
      expect(result.status).toBe("Complete");
      expect(result.resultUrl).toBe("https://results.ttd.com/job-q1.csv");
      expect(result.progress).toEqual({ completed: 100, total: 100 });
    });

    it("handles job without resultUrl (still running)", async () => {
      mockTtdService.graphqlQuery.mockResolvedValueOnce({
        data: {
          bulkJob: {
            jobId: "job-q2",
            status: "Running",
            progress: { completed: 45, total: 100 },
          },
        },
      });

      const result = await graphqlBulkJobLogic(
        { jobId: "job-q2" },
        createMockContext(),
        createMockSdkContext()
      );

      expect(result.status).toBe("Running");
      expect(result.resultUrl).toBeUndefined();
      expect(result.progress).toEqual({ completed: 45, total: 100 });
    });

    it("response formatter shows progress percentage", () => {
      const text = graphqlBulkJobResponseFormatter({
        jobId: "job-q2",
        status: "Running",
        progress: { completed: 450, total: 1000 },
        timestamp: new Date().toISOString(),
      })[0].text;

      expect(text).toContain("450/1000 (45%)");
    });

    it("response formatter shows expiry warning when resultUrl present", () => {
      const expiresAt = new Date(Date.now() + 25 * 60_000).toISOString();
      const text = graphqlBulkJobResponseFormatter({
        jobId: "job-q1",
        status: "Complete",
        resultUrl: "https://results.ttd.com/job-q1.csv",
        resultExpiresAt: expiresAt,
        timestamp: new Date().toISOString(),
      })[0].text;

      expect(text).toContain("Result URL");
      expect(text).toContain("expires in ~");
      expect(text).toContain("ttd_download_report");
    });
  });

  // ── cancelBulkJob ──

  describe("graphqlCancelBulkJobLogic", () => {
    it("passes jobId and returns cancelled status", async () => {
      mockTtdService.graphqlQuery.mockResolvedValueOnce({
        data: {
          cancelBulkJob: { jobId: "job-q1", status: "Cancelled" },
        },
      });

      const result = await graphqlCancelBulkJobLogic(
        { jobId: "job-q1" },
        createMockContext(),
        createMockSdkContext()
      );

      expect(result.jobId).toBe("job-q1");
      expect(result.status).toBe("Cancelled");
      expect(mockTtdService.graphqlQuery).toHaveBeenCalledWith(
        expect.stringContaining("cancelBulkJob"),
        { jobId: "job-q1" },
        expect.any(Object)
      );
    });

    it("propagates error when job is non-cancelable (mutation job)", async () => {
      mockTtdService.graphqlQuery.mockRejectedValueOnce(
        new Error("Cannot cancel mutation bulk job")
      );

      await expect(
        graphqlCancelBulkJobLogic(
          { jobId: "job-m1" },
          createMockContext(),
          createMockSdkContext()
        )
      ).rejects.toThrow("Cannot cancel mutation bulk job");
    });

    it("response formatter shows cancellation info", () => {
      const text = graphqlCancelBulkJobResponseFormatter({
        jobId: "job-q1",
        status: "Cancelled",
        timestamp: new Date().toISOString(),
      })[0].text;

      expect(text).toContain("cancelled");
      expect(text).toContain("job-q1");
    });
  });

  // ── Session resolution ──

  describe("session resolution", () => {
    it("all 4 tools throw when resolveSessionServices fails", async () => {
      mockResolveSessionServices.mockImplementation(() => {
        throw new Error("No session ID available");
      });

      const ctx = createMockContext();

      await expect(
        graphqlQueryBulkLogic(
          { query: "query { foo }", variables: [{ id: "1" }] },
          ctx
        )
      ).rejects.toThrow("No session ID available");

      await expect(
        graphqlMutationBulkLogic(
          { mutation: "mutation { foo }", inputs: [{ id: "1" }] },
          ctx
        )
      ).rejects.toThrow("No session ID available");

      await expect(
        graphqlBulkJobLogic({ jobId: "job-1" }, ctx)
      ).rejects.toThrow("No session ID available");

      await expect(
        graphqlCancelBulkJobLogic({ jobId: "job-1" }, ctx)
      ).rejects.toThrow("No session ID available");
    });
  });
});

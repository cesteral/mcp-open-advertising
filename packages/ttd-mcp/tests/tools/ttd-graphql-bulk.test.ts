import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockResolveSessionServices } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

import {
  graphqlQueryBulkLogic,
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
    it("passes query + JSON-encoded queryVariables and returns jobId + status", async () => {
      mockTtdService.graphqlQuery.mockResolvedValueOnce({
        data: {
          createQueryBulk: { data: { id: "2989826", status: "QUEUED" }, errors: [] },
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

      expect(result.jobId).toBe("2989826");
      expect(result.status).toBe("QUEUED");
      expect(result.timestamp).toBeDefined();
      expect(mockTtdService.graphqlQuery).toHaveBeenCalledWith(
        expect.stringContaining("createQueryBulk"),
        {
          input: {
            query: "query Adv($id: ID!) { advertiser(id: $id) { name } }",
            queryVariables: JSON.stringify([{ id: "adv1" }, { id: "adv2" }]),
          },
        },
        expect.any(Object),
        { betaFeatures: undefined }
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
    it("passes mutation + mutationVariables as array of JSON strings and returns jobId + status", async () => {
      mockTtdService.graphqlQuery.mockResolvedValueOnce({
        data: {
          createMutationBulk: { data: { id: "2989900", status: "QUEUED" }, errors: [] },
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

      expect(result.jobId).toBe("2989900");
      expect(result.status).toBe("QUEUED");
      expect(mockTtdService.graphqlQuery).toHaveBeenCalledWith(
        expect.stringContaining("createMutationBulk"),
        {
          input: {
            mutation: expect.any(String),
            mutationVariables: [JSON.stringify({ id: "c1", name: "New" })],
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
        jobId: "2989900",
        status: "QUEUED",
        timestamp: new Date().toISOString(),
      })[0].text;

      expect(text).toContain("NON-CANCELABLE");
      expect(text).toContain("2989900");
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
    it("queries by id and returns full job status with url", async () => {
      mockTtdService.graphqlQuery.mockResolvedValueOnce({
        data: {
          bulkJob: {
            __typename: "BulkQueryJob",
            id: "2989826",
            status: "SUCCESS",
            createdAt: "2026-04-14T10:49:55.64Z",
            completedAt: "2026-04-14T10:49:56.266Z",
            url: "https://results.ttd.com/job.csv",
          },
        },
      });

      const result = await graphqlBulkJobLogic(
        { jobId: "2989826" },
        createMockContext(),
        createMockSdkContext()
      );

      expect(result.jobId).toBe("2989826");
      expect(result.status).toBe("SUCCESS");
      expect(result.jobType).toBe("BulkQueryJob");
      expect(result.resultUrl).toBe("https://results.ttd.com/job.csv");
      expect(mockTtdService.graphqlQuery).toHaveBeenCalledWith(
        expect.stringContaining("bulkJob"),
        { id: "2989826" },
        expect.any(Object)
      );
    });

    it("handles job still running (no url)", async () => {
      mockTtdService.graphqlQuery.mockResolvedValueOnce({
        data: {
          bulkJob: {
            __typename: "BulkQueryJob",
            id: "2989827",
            status: "RUNNING",
          },
        },
      });

      const result = await graphqlBulkJobLogic(
        { jobId: "2989827" },
        createMockContext(),
        createMockSdkContext()
      );

      expect(result.status).toBe("RUNNING");
      expect(result.resultUrl).toBeUndefined();
    });

    it("response formatter shows expiry warning when resultUrl present", () => {
      const text = graphqlBulkJobResponseFormatter({
        jobId: "2989826",
        status: "SUCCESS",
        jobType: "BulkQueryJob",
        resultUrl: "https://results.ttd.com/job.csv",
        timestamp: new Date().toISOString(),
      })[0].text;

      expect(text).toContain("Result URL");
      expect(text).toContain("expires");
    });
  });

  // ── cancelBulkJob ──

  describe("graphqlCancelBulkJobLogic", () => {
    it("wraps jobId in CancelBulkJobInput and returns cancelled status", async () => {
      mockTtdService.graphqlQuery.mockResolvedValueOnce({
        data: {
          cancelBulkJob: { data: { id: "2989826", status: "CANCELLED" }, errors: [] },
        },
      });

      const result = await graphqlCancelBulkJobLogic(
        { jobId: "2989826" },
        createMockContext(),
        createMockSdkContext()
      );

      expect(result.jobId).toBe("2989826");
      expect(result.status).toBe("CANCELLED");
      expect(mockTtdService.graphqlQuery).toHaveBeenCalledWith(
        expect.stringContaining("cancelBulkJob"),
        { input: { jobId: "2989826" } },
        expect.any(Object)
      );
    });

    it("throws when payload.errors is populated (non-cancelable mutation job)", async () => {
      mockTtdService.graphqlQuery.mockResolvedValueOnce({
        data: {
          cancelBulkJob: {
            data: null,
            errors: [{ __typename: "BulkJobNotCancelableError" }],
          },
        },
      });

      await expect(
        graphqlCancelBulkJobLogic(
          { jobId: "job-m1" },
          createMockContext(),
          createMockSdkContext()
        )
      ).rejects.toThrow("Cannot cancel bulk job");
    });

    it("response formatter shows cancellation info", () => {
      const text = graphqlCancelBulkJobResponseFormatter({
        jobId: "2989826",
        status: "CANCELLED",
        timestamp: new Date().toISOString(),
      })[0].text;

      expect(text).toContain("cancelled");
      expect(text).toContain("2989826");
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

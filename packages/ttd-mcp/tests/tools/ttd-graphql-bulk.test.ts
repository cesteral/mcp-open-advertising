import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockResolveSessionServices } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

import {
  graphqlQueryBulkLogic,
  graphqlQueryBulkTool,
  GraphqlQueryBulkInputSchema,
} from "../../src/mcp-server/tools/definitions/graphql-query-bulk.tool.js";
import {
  graphqlMutationBulkLogic,
  graphqlMutationBulkTool,
  graphqlMutationBulkResponseFormatter,
  GraphqlMutationBulkInputSchema,
} from "../../src/mcp-server/tools/definitions/graphql-mutation-bulk.tool.js";
import {
  graphqlBulkJobLogic,
  graphqlBulkJobTool,
  graphqlBulkJobResponseFormatter,
  GraphqlBulkJobOutputSchema,
} from "../../src/mcp-server/tools/definitions/graphql-bulk-job.tool.js";
import {
  graphqlCancelBulkJobLogic,
  graphqlCancelBulkJobResponseFormatter,
} from "../../src/mcp-server/tools/definitions/graphql-cancel-bulk-job.tool.js";
import {
  classifyBulkJobStatus,
  describePayloadErrors,
  normalizeGqlErrors,
} from "../../src/mcp-server/tools/utils/graphql-bulk-job.js";

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

    it("selects MutationError and BulkJobQueryValidationError messages (TTD sample shape)", async () => {
      mockTtdService.graphqlQuery.mockResolvedValueOnce({
        data: { createQueryBulk: { data: { id: "1", status: "QUEUED" }, errors: [] } },
      });
      await graphqlQueryBulkLogic(
        { query: "query { me { id } }", variables: [{}] },
        createMockContext(),
        createMockSdkContext()
      );
      const doc = mockTtdService.graphqlQuery.mock.calls[0][0] as string;
      expect(doc).toMatch(/\.\.\. on MutationError \{\s*field\s*message\s*\}/);
      expect(doc).toMatch(
        /\.\.\. on BulkJobQueryValidationError \{\s*field\s*message\s*queryErrors\s*\}/
      );
    });

    it("surfaces payload error message, field and queryErrors instead of only __typename", async () => {
      mockTtdService.graphqlQuery.mockResolvedValueOnce({
        data: {
          createQueryBulk: {
            data: null,
            errors: [
              {
                __typename: "BulkJobQueryValidationError",
                message: "The query is invalid",
                field: ["input", "query"],
                queryErrors: ["Unknown field 'foo' on type 'Advertiser'"],
              },
            ],
          },
        },
      });

      const err = await graphqlQueryBulkLogic(
        { query: "query { advertiser(id: 1) { foo } }", variables: [{}] },
        createMockContext(),
        createMockSdkContext()
      ).catch((e) => e);

      expect(err.message).toContain("The query is invalid");
      expect(err.message).toContain("field: input.query");
      expect(err.message).toContain("Unknown field 'foo'");
      expect(err.message).not.toMatch(/failed: BulkJobQueryValidationError$/);
    });

    it("stringifies a numeric job id", async () => {
      mockTtdService.graphqlQuery.mockResolvedValueOnce({
        data: { createQueryBulk: { data: { id: 2989826, status: "QUEUED" }, errors: null } },
      });
      const result = await graphqlQueryBulkLogic(
        { query: "query { me { id } }", variables: [{}] },
        createMockContext(),
        createMockSdkContext()
      );
      expect(result.jobId).toBe("2989826");
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
        const tokenIssue = result.error.issues.find((i) => i.message.includes("15,000"));
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

    it("requests and surfaces MutationError.message on payload errors", async () => {
      mockTtdService.graphqlQuery.mockResolvedValueOnce({
        data: {
          createMutationBulk: {
            data: null,
            errors: [
              { __typename: "MutationError", message: "Too many active bulk jobs", field: null },
            ],
          },
        },
      });

      const err = await graphqlMutationBulkLogic(
        {
          mutation:
            "mutation U($input: BidListUpdateInput!) { bidListUpdate(input: $input) { data { id } } }",
          inputs: [{ id: "bl1" }],
        },
        createMockContext(),
        createMockSdkContext()
      ).catch((e) => e);

      expect(err.message).toContain("Too many active bulk jobs");
      const doc = mockTtdService.graphqlQuery.mock.calls[0][0] as string;
      expect(doc).toMatch(/\.\.\. on MutationError \{\s*field\s*message\s*\}/);
    });

    it("examples use TTD's entity-then-verb mutation names, not updateCampaign/updateAdGroup", () => {
      const docs = [
        graphqlMutationBulkTool.description,
        ...graphqlMutationBulkTool.inputExamples.map((e) => e.input.mutation as string),
      ];
      for (const doc of docs) {
        // Operation fields invoked in the document: `name(input:`
        const invoked = [...doc.matchAll(/\b([a-zA-Z]+)\(input:/g)].map((m) => m[1]);
        for (const field of invoked) {
          if (field === "createMutationBulk") continue;
          expect(field).not.toMatch(/^(update|create|delete|set)[A-Z]/);
        }
      }
      for (const example of graphqlMutationBulkTool.inputExamples) {
        expect(example.input.mutation).toContain("bidListUpdate(input: $input)");
      }
    });
  });

  // ── bulkJob ──

  describe("graphqlBulkJobLogic", () => {
    it("queries by id and returns full job status with url", async () => {
      mockTtdService.graphqlQuery.mockResolvedValueOnce({
        data: {
          bulkJob: {
            __typename: "BulkJob",
            id: "2989826",
            status: "SUCCESS",
            createdAt: "2026-04-14T10:49:55.64Z",
            completedAt: "2026-04-14T10:49:56.266Z",
            url: "https://results.example/job.json",
            gqlErrors: null,
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
      expect(result.outcome).toBe("success");
      expect(result.terminal).toBe(true);
      expect(result.jobType).toBe("BulkJob");
      expect(result.resultUrl).toBe("https://results.example/job.json");
      expect(result.gqlErrors).toBeUndefined();
      expect(mockTtdService.graphqlQuery).toHaveBeenCalledWith(
        expect.stringContaining("bulkJob"),
        { id: "2989826" },
        expect.any(Object)
      );
      expect(GraphqlBulkJobOutputSchema.safeParse(result).success).toBe(true);
    });

    it("selects url and gqlErrors directly on bulkJob (TTD sample field set), with no guessed type fragments", async () => {
      mockTtdService.graphqlQuery.mockResolvedValueOnce({
        data: { bulkJob: { id: "1", status: "QUEUED" } },
      });
      await graphqlBulkJobLogic({ jobId: "1" }, createMockContext(), createMockSdkContext());

      const doc = mockTtdService.graphqlQuery.mock.calls[0][0] as string;
      const selection = doc.slice(doc.indexOf("bulkJob(id: $id) {"));
      for (const field of ["id", "status", "url", "gqlErrors"]) {
        expect(selection).toMatch(new RegExp(`^\\s+${field}$`, "m"));
      }
      expect(doc).not.toContain("... on");
      // Workflows-REST-only names must not be requested: one unknown field fails the whole poll.
      for (const field of [
        "completionPercentage",
        "runtimeErrors",
        "rawResult",
        "queryGqlErrors",
      ]) {
        expect(doc).not.toContain(field);
      }
    });

    it.each([["QUEUED"], ["IN_PROGRESS"]])("reports %s as non-terminal", async (status) => {
      mockTtdService.graphqlQuery.mockResolvedValueOnce({
        data: { bulkJob: { id: "2989827", status } },
      });

      const result = await graphqlBulkJobLogic(
        { jobId: "2989827" },
        createMockContext(),
        createMockSdkContext()
      );

      expect(result.status).toBe(status);
      expect(result.terminal).toBe(false);
      expect(result.resultUrl).toBeUndefined();
      expect(graphqlBulkJobResponseFormatter(result)[0].text).toContain("Poll again");
    });

    it("treats PARTIAL_SUCCESS as terminal and surfaces gqlErrors with a no-rollback warning", async () => {
      mockTtdService.graphqlQuery.mockResolvedValueOnce({
        data: {
          bulkJob: {
            id: "2989900",
            status: "PARTIAL_SUCCESS",
            url: "https://results.example/job.json",
            gqlErrors: ["Input 17: bid list bl-17 not found", "Input 42: UNAUTHORIZED"],
          },
        },
      });

      const result = await graphqlBulkJobLogic(
        { jobId: "2989900" },
        createMockContext(),
        createMockSdkContext()
      );

      expect(result.outcome).toBe("partial_success");
      expect(result.terminal).toBe(true);
      expect(result.gqlErrors).toEqual([
        "Input 17: bid list bl-17 not found",
        "Input 42: UNAUTHORIZED",
      ]);

      const text = graphqlBulkJobResponseFormatter(result)[0].text;
      expect(text).toContain("PARTIAL SUCCESS");
      expect(text).toContain("(terminal)");
      expect(text).toContain("Input 17: bid list bl-17 not found");
      expect(text).toMatch(/cannot be cancelled or rolled back/);
    });

    it("treats FAILURE with no url as terminal and prints gqlErrors", async () => {
      mockTtdService.graphqlQuery.mockResolvedValueOnce({
        data: {
          bulkJob: {
            id: "2989901",
            status: "FAILURE",
            url: null,
            gqlErrors: ["AUTHENTICATION_FAILURE"],
          },
        },
      });

      const result = await graphqlBulkJobLogic(
        { jobId: "2989901" },
        createMockContext(),
        createMockSdkContext()
      );

      expect(result.outcome).toBe("failure");
      expect(result.terminal).toBe(true);
      expect(result.resultUrl).toBeUndefined();
      const text = graphqlBulkJobResponseFormatter(result)[0].text;
      expect(text).toContain("FAILED");
      expect(text).toContain("AUTHENTICATION_FAILURE");
    });

    it("response formatter points at a JSON fetch, not the CSV report downloader", () => {
      const text = graphqlBulkJobResponseFormatter({
        jobId: "2989826",
        status: "SUCCESS",
        outcome: "success",
        terminal: true,
        resultUrl: "https://results.example/job.json",
        timestamp: new Date().toISOString(),
      })[0].text;

      expect(text).toContain("Result URL");
      expect(text).toContain("expires");
      expect(text).toContain("JSON");
      expect(text).not.toMatch(/use `?ttd_download_report/i);
    });
  });

  // ── status classification ──

  describe("classifyBulkJobStatus", () => {
    it.each([
      ["QUEUED", "queued", false],
      ["IN_PROGRESS", "in_progress", false],
      ["SUCCESS", "success", true],
      ["PARTIAL_SUCCESS", "partial_success", true],
      ["FAILURE", "failure", true],
      ["CANCELLED", "cancelled", true],
      // Workflows SDK wire spellings (bulkjobstatus.py) classify identically.
      ["Queued", "queued", false],
      ["InProgress", "in_progress", false],
      ["PartialSuccess", "partial_success", true],
      ["Failure", "failure", true],
      ["Success", "success", true],
      ["Cancelled", "cancelled", true],
    ] as const)("%s -> %s (terminal=%s)", (status, outcome, terminal) => {
      expect(classifyBulkJobStatus(status)).toEqual({ outcome, terminal });
    });

    it("an unknown status is terminal and unrecognized (TTD samples poll only while QUEUED/IN_PROGRESS)", () => {
      expect(classifyBulkJobStatus("RUNNING")).toEqual({ outcome: "unrecognized", terminal: true });
      expect(classifyBulkJobStatus(undefined)).toEqual({ outcome: "unrecognized", terminal: true });
    });

    it("normalizeGqlErrors accepts arrays, scalars and objects", () => {
      expect(normalizeGqlErrors(null)).toBeUndefined();
      expect(normalizeGqlErrors([])).toBeUndefined();
      expect(normalizeGqlErrors("boom")).toEqual(["boom"]);
      expect(normalizeGqlErrors([{ message: "x" }, "y"])).toEqual(['{"message":"x"}', "y"]);
    });

    it("describePayloadErrors falls back to __typename only when message is absent", () => {
      expect(describePayloadErrors([{ __typename: "SomeError" }])).toBe("SomeError");
      expect(
        describePayloadErrors([{ __typename: "MutationError", message: "m", field: "f" }])
      ).toBe("m (field: f)");
    });
  });

  // ── published tool text ──

  describe("bulk tool descriptions", () => {
    const tools = [graphqlQueryBulkTool, graphqlMutationBulkTool, graphqlBulkJobTool];

    it.each(tools.map((t) => [t.name, t] as const))(
      "%s lists TTD's statuses (no RUNNING) and does not route bulk results to ttd_download_report",
      (_name, tool) => {
        expect(tool.description).not.toContain("RUNNING");
        expect(tool.description).toContain("PARTIAL_SUCCESS");
        expect(tool.description).not.toMatch(/via `ttd_download_report`/);
        expect(tool.description).toMatch(/not (a )?CSV/);
        const outputShape = JSON.stringify(
          (tool.outputSchema as any).shape.status._def.description ??
            (tool.outputSchema as any).shape.status.description
        );
        expect(outputShape).not.toContain("RUNNING");
      }
    );

    it("bulk job description lists all six statuses and says which are terminal", () => {
      for (const s of [
        "QUEUED",
        "IN_PROGRESS",
        "SUCCESS",
        "PARTIAL_SUCCESS",
        "FAILURE",
        "CANCELLED",
      ]) {
        expect(graphqlBulkJobTool.description).toContain(`**${s}**`);
      }
      expect(graphqlBulkJobTool.description).toContain("terminal");
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
        graphqlCancelBulkJobLogic({ jobId: "job-m1" }, createMockContext(), createMockSdkContext())
      ).rejects.toThrow("Cannot cancel bulk job");
    });

    it("surfaces MutationError.message when cancel is rejected", async () => {
      mockTtdService.graphqlQuery.mockResolvedValueOnce({
        data: {
          cancelBulkJob: {
            data: null,
            errors: [{ __typename: "MutationError", message: "Mutation jobs cannot be cancelled" }],
          },
        },
      });

      await expect(
        graphqlCancelBulkJobLogic({ jobId: "job-m1" }, createMockContext(), createMockSdkContext())
      ).rejects.toThrow("Cannot cancel bulk job: Mutation jobs cannot be cancelled");
      const doc = mockTtdService.graphqlQuery.mock.calls[0][0] as string;
      expect(doc).toMatch(/\.\.\. on MutationError \{\s*field\s*message\s*\}/);
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
        graphqlQueryBulkLogic({ query: "query { foo }", variables: [{ id: "1" }] }, ctx)
      ).rejects.toThrow("No session ID available");

      await expect(
        graphqlMutationBulkLogic({ mutation: "mutation { foo }", inputs: [{ id: "1" }] }, ctx)
      ).rejects.toThrow("No session ID available");

      await expect(graphqlBulkJobLogic({ jobId: "job-1" }, ctx)).rejects.toThrow(
        "No session ID available"
      );

      await expect(graphqlCancelBulkJobLogic({ jobId: "job-1" }, ctx)).rejects.toThrow(
        "No session ID available"
      );
    });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockResolveSessionServices } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

import {
  graphqlMutationBulkLogic,
  graphqlMutationBulkTool,
  GraphqlMutationBulkInputSchema,
} from "../../src/mcp-server/tools/definitions/graphql-mutation-bulk.tool.js";
import {
  graphqlBulkJobLogic,
  graphqlBulkJobResponseFormatter,
  graphqlBulkJobTool,
  GraphqlBulkJobInputSchema,
  GraphqlBulkJobOutputSchema,
} from "../../src/mcp-server/tools/definitions/graphql-bulk-job.tool.js";
import {
  inspectBulkMutation,
  mutationBulkProductionRefusal,
} from "../../src/mcp-server/tools/utils/graphql-bulk-job.js";

// Fixtures below are TTD's own published examples from the GraphQL "Bulk
// operations" page (https://open.thetradedesk.com/advertiser/docsApp/Foundations/resources/doc/GqlBulkOperations,
// read 2026-10-01). That page documents createMutationBulk, mutationVariables
// (an array of JSON-encoded `{ "input": { ... } }` strings, keyed by the
// mutation's variable name) and the bulkJob poll with typed error fragments.

const DOC_MUTATION = `
mutation ($input: AdGroupCreateInput!) {
    adGroupCreate(input: $input) {
        data {
            id
        }
        userErrors {
            field
            message
        }
    }
}
`;

const DOC_INPUTS = [
  { campaignId: "abc123", name: "AdGroup1", channel: "TV", funnelLocation: "CONVERSION" },
  {
    campaignId: "def456",
    name: "AdGroup2",
    description: "test",
    channel: "TV",
    funnelLocation: "CONVERSION",
  },
];

const SANDBOX_GRAPHQL = "https://ext-api.sb.thetradedesk.com/graphql";
const ctx = { requestId: "req" } as any;
const sdk = { sessionId: "s" } as any;

describe("inspectBulkMutation", () => {
  it("finds the one variable and one operation in TTD's documented example", () => {
    expect(inspectBulkMutation(DOC_MUTATION)).toEqual({ operations: 1, variables: ["input"] });
  });

  it("handles a named operation and a differently named variable", () => {
    expect(
      inspectBulkMutation("mutation UpdateBidList($data: BidListUpdateInput!) { x(input: $data) }")
    ).toEqual({ operations: 1, variables: ["data"] });
  });

  it("ignores variable-looking text in comments and strings", () => {
    const source = `# ($ghost: X)
mutation ($input: X!) { a(input: $input, note: "($fake: Y)") { id } }`;
    expect(inspectBulkMutation(source).variables).toEqual(["input"]);
  });

  it("reports no variables, several variables, and several operations", () => {
    expect(inspectBulkMutation("mutation { foo }").variables).toEqual([]);
    expect(inspectBulkMutation("mutation ($a: A!, $b: B) { f }").variables).toEqual(["a", "b"]);
    expect(
      inspectBulkMutation(
        "mutation A($i: I!) { a(input: $i) }\nmutation B($i: I!) { b(input: $i) }"
      ).operations
    ).toBe(2);
  });

  it("does not mistake a variable named $mutation for a second operation", () => {
    expect(inspectBulkMutation("mutation ($mutation: X!) { a(input: $mutation) { id } }")).toEqual({
      operations: 1,
      variables: ["mutation"],
    });
  });

  it("does not count the word 'mutation' inside a selection or a string as an operation", () => {
    expect(
      inspectBulkMutation(
        'mutation ($input: X!) { mutation(input: $input) { note(text: "mutation") } }'
      ).operations
    ).toBe(1);
  });
});

describe("ttd_graphql_mutation_bulk binds entries the way TTD documents", () => {
  let service: { graphqlQuery: ReturnType<typeof vi.fn>; graphqlEndpoint: string };

  beforeEach(() => {
    service = { graphqlQuery: vi.fn(), graphqlEndpoint: SANDBOX_GRAPHQL };
    mockResolveSessionServices.mockReturnValue({ ttdService: service });
    service.graphqlQuery.mockResolvedValue({
      data: { createMutationBulk: { data: { id: "555", status: "QUEUED" }, errors: [] } },
    });
  });

  it("sends each entry as a JSON string keyed by the mutation's variable name", async () => {
    await graphqlMutationBulkLogic({ mutation: DOC_MUTATION, inputs: DOC_INPUTS }, ctx, sdk);

    const [, variables] = service.graphqlQuery.mock.calls[0]!;
    expect(variables.mutation).toBe(DOC_MUTATION);
    expect(variables.mutationVariables).toHaveLength(2);
    // TTD's example element: "{ \"input\": { \"campaignId\": ... } }" — a string.
    for (const element of variables.mutationVariables) expect(typeof element).toBe("string");
    expect(variables.mutationVariables.map((e: string) => JSON.parse(e))).toEqual([
      { input: DOC_INPUTS[0] },
      { input: DOC_INPUTS[1] },
    ]);
  });

  it("keys entries by whatever the single variable is called", async () => {
    await graphqlMutationBulkLogic(
      {
        mutation: "mutation Update($data: BidListUpdateInput!) { u(input: $data) { id } }",
        inputs: [{ id: "bl1" }],
      },
      ctx,
      sdk
    );
    const [, variables] = service.graphqlQuery.mock.calls[0]!;
    expect(JSON.parse(variables.mutationVariables[0])).toEqual({ data: { id: "bl1" } });
  });

  it("submits createMutationBulk with mutation and mutationVariables, as TTD's example does", async () => {
    await graphqlMutationBulkLogic({ mutation: DOC_MUTATION, inputs: DOC_INPUTS }, ctx, sdk);
    const query = service.graphqlQuery.mock.calls[0]![0] as string;
    expect(query).toMatch(/createMutationBulk\(\s*input:\s*\{/);
    expect(query).toContain("mutation: $mutation");
    expect(query).toContain("mutationVariables: $mutationVariables");
    // The input type's name is not shown by TTD's page, so it must not be guessed.
    expect(query).not.toContain("CreateMutationBulkInput");
  });

  it("refuses a mutation that does not declare exactly one variable", () => {
    for (const mutation of ["mutation { foo }", "mutation ($a: A!, $b: B!) { f(a: $a, b: $b) }"]) {
      const parsed = GraphqlMutationBulkInputSchema.safeParse({ mutation, inputs: [{ id: "1" }] });
      expect(parsed.success, mutation).toBe(false);
      expect(JSON.stringify(parsed.error?.issues)).toMatch(/exactly one variable/);
    }
  });

  it("refuses more than one mutation operation, which TTD does not allow", () => {
    const parsed = GraphqlMutationBulkInputSchema.safeParse({
      mutation:
        "mutation A($i: I!) { a(input: $i) { id } }\nmutation B($i: I!) { b(input: $i) { id } }",
      inputs: [{ id: "1" }],
    });
    expect(parsed.success).toBe(false);
    expect(JSON.stringify(parsed.error?.issues)).toMatch(/one mutation operation/);
  });

  it("also refuses when called directly, without the schema, and calls TTD never", async () => {
    await expect(
      graphqlMutationBulkLogic({ mutation: "mutation { foo }", inputs: [{ id: "1" }] }, ctx, sdk)
    ).rejects.toThrow(/exactly one variable/);
    expect(service.graphqlQuery).not.toHaveBeenCalled();
  });

  it("accepts TTD's documented example", () => {
    expect(
      GraphqlMutationBulkInputSchema.safeParse({ mutation: DOC_MUTATION, inputs: DOC_INPUTS })
        .success
    ).toBe(true);
  });

  it("no longer says TTD never shows createMutationBulk, and names the documented binding", () => {
    const text = graphqlMutationBulkTool.description;
    expect(text).not.toMatch(/No TTD source/i);
    expect(text).not.toMatch(/not shown in any TTD source/i);
    expect(text).toContain("mutationVariables");
    expect(text).toContain("mutationGqlErrors");
    // The gate and the cap stay, for a different reason: it has never run against TTD.
    expect(text).toContain("TTD_ALLOW_UNVERIFIED_MUTATION_BULK");
    expect(text).toMatch(/never (been )?(run|submitted)/i);
  });

  it("keeps the production gate, now saying why: documented, but never run by this server", () => {
    const refusal = mutationBulkProductionRefusal("https://api.thetradedesk.com/graphql", {});
    expect(refusal).toBeDefined();
    expect(refusal).not.toMatch(/not shown in any TTD source/i);
    expect(refusal).toMatch(/documents createMutationBulk/);
    expect(refusal).toMatch(/cannot be cancelled/);
    expect(refusal).toContain("TTD_ALLOW_UNVERIFIED_MUTATION_BULK");
    expect(mutationBulkProductionRefusal(SANDBOX_GRAPHQL, {})).toBeUndefined();
  });
});

describe("ttd_graphql_bulk_job polls TTD's documented fields", () => {
  let service: { graphqlQuery: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    service = { graphqlQuery: vi.fn() };
    mockResolveSessionServices.mockReturnValue({ ttdService: service });
  });

  it("selects the fields of TTD's own bulkJob example, including the typed error fragments", async () => {
    service.graphqlQuery.mockResolvedValueOnce({
      data: { bulkJob: { id: "1", status: "QUEUED" } },
    });
    await graphqlBulkJobLogic({ jobId: "123" }, ctx, sdk);

    const doc = service.graphqlQuery.mock.calls[0]![0] as string;
    for (const field of [
      "id",
      "createdAt",
      "rawResult",
      "completionPercentage",
      "completedAt",
      "status",
      "url",
      "runtimeErrors",
    ]) {
      expect(doc, field).toMatch(new RegExp(`^\\s+${field}$`, "m"));
    }
    expect(doc).toMatch(
      /\.\.\. on BulkMutationJob \{\s*mutationGqlErrors \{\s*error\s*index\s*\}\s*\}/
    );
    expect(doc).toMatch(/\.\.\. on BulkQueryJob \{\s*queryGqlErrors\s*\}/);
    // Not in TTD's example; one unknown field would fail the whole poll.
    expect(doc).not.toMatch(/^\s+gqlErrors$/m);
  });

  it("writes the id as the literal TTD's example uses, so it works for an ID or an integer argument", async () => {
    service.graphqlQuery.mockResolvedValueOnce({
      data: { bulkJob: { id: "1", status: "QUEUED" } },
    });
    await graphqlBulkJobLogic({ jobId: "2989826" }, ctx, sdk);
    const doc = service.graphqlQuery.mock.calls[0]![0] as string;
    expect(doc).toContain("bulkJob(id: 2989826)");
    expect(doc).not.toContain("$id");
  });

  it("refuses a job id that could not be a literal, before calling TTD", async () => {
    await expect(
      graphqlBulkJobLogic({ jobId: "1) { id } evil: bulkJob(id: 2" }, ctx, sdk)
    ).rejects.toThrow(/job id/i);
    expect(service.graphqlQuery).not.toHaveBeenCalled();
    expect(GraphqlBulkJobInputSchema.safeParse({ jobId: "1 2" }).success).toBe(false);
  });

  it("reports per-input errors of a PARTIAL_SUCCESS mutation job with their input index", async () => {
    service.graphqlQuery.mockResolvedValueOnce({
      data: {
        bulkJob: {
          __typename: "BulkMutationJob",
          id: "2989900",
          status: "PARTIAL_SUCCESS",
          completionPercentage: 100,
          url: "https://results.example/job.json",
          runtimeErrors: null,
          mutationGqlErrors: [
            { error: "bid list bl-17 not found", index: 17 },
            { error: "UNAUTHORIZED", index: 42 },
          ],
        },
      },
    });

    const result = await graphqlBulkJobLogic({ jobId: "2989900" }, ctx, sdk);

    expect(result.outcome).toBe("partial_success");
    expect(result.terminal).toBe(true);
    expect(result.completionPercentage).toBe(100);
    expect(result.mutationGqlErrors).toEqual([
      { error: "bid list bl-17 not found", index: 17 },
      { error: "UNAUTHORIZED", index: 42 },
    ]);
    expect(GraphqlBulkJobOutputSchema.safeParse(result).success).toBe(true);

    const text = graphqlBulkJobResponseFormatter(result)[0]!.text;
    expect(text).toContain("input #17: bid list bl-17 not found");
    expect(text).toContain("input #42: UNAUTHORIZED");
    expect(text).toMatch(/cannot be cancelled or rolled back/);
  });

  it("surfaces runtime errors, query errors and a small inline result", async () => {
    service.graphqlQuery.mockResolvedValueOnce({
      data: {
        bulkJob: {
          __typename: "BulkQueryJob",
          id: "7",
          status: "FAILURE",
          runtimeErrors: ["timeout while reading campaigns"],
          queryGqlErrors: ["Cannot query field foo"],
          rawResult: '{"data":{"advertiser":null}}',
        },
      },
    });

    const result = await graphqlBulkJobLogic({ jobId: "7" }, ctx, sdk);

    expect(result.outcome).toBe("failure");
    expect(result.runtimeErrors).toEqual(["timeout while reading campaigns"]);
    expect(result.queryGqlErrors).toEqual(["Cannot query field foo"]);
    expect(result.rawResult).toBe('{"data":{"advertiser":null}}');
    const text = graphqlBulkJobResponseFormatter(result)[0]!.text;
    expect(text).toContain("timeout while reading campaigns");
    expect(text).toContain("Cannot query field foo");
  });

  it("declares every platform-text field as untrusted", () => {
    const declared = (graphqlBulkJobTool.untrustedContent as { structuredPaths: string[] })
      .structuredPaths;
    for (const path of [
      "$.runtimeErrors",
      "$.mutationGqlErrors",
      "$.queryGqlErrors",
      "$.rawResult",
    ]) {
      expect(declared).toContain(path);
    }
  });

  it("tells the caller where per-input errors arrive", () => {
    expect(graphqlBulkJobTool.description).toContain("mutationGqlErrors");
    expect(graphqlBulkJobTool.description).not.toContain("gqlErrors`");
  });
});

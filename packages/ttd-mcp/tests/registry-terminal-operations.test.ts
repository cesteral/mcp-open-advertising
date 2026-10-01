import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const registry = JSON.parse(readFileSync(join(here, "../../../registry.json"), "utf8")) as {
  servers: Array<{
    package: string;
    resources?: string[];
    operational?: { terminalOperations?: Array<{ tool: string; operations: string[] }> };
  }>;
};
const ttd = registry.servers.find((s) => s.package === "ttd-mcp")!;

describe("registry.json ttd-mcp entry (fleet review 2026-09, ttd GraphQL #6 and #15)", () => {
  it("declares ttd_graphql_query terminal: it passes any mutation, including deletes", () => {
    // ttd_graphql_mutation_bulk was declared for the same reason; the single-call
    // passthrough runs the same mutations and was left out of the card's
    // rollback.terminalOperations.
    const entry = ttd.operational?.terminalOperations?.find((t) => t.tool === "ttd_graphql_query");
    expect(entry?.operations).toEqual(["manage"]);
  });

  it("lists the graphql-reference://ttd resource the server registers", () => {
    expect(ttd.resources).toContain("graphql-reference://ttd");
  });
});

import { describe, it, expect } from "vitest";
import { allResources } from "../../src/mcp-server/resources/definitions/index.js";

/**
 * Fleet review 2026-09, ttd GraphQL #14: the server-capabilities resource sent
 * agents to `graphql-reference://all`, a URI nothing registers (the GraphQL
 * reference is `graphql-reference://ttd`). Every concrete `scheme://…` URI the
 * resources name must be one this server registers.
 */
describe("ttd resource text names only registered resource URIs", () => {
  const registered = new Set(allResources.map((r) => r.uri));
  const uriPattern = /\b([a-z][a-z-]*-reference|server-capabilities):\/\/[A-Za-z0-9_./-]+/g;

  it("graphql-reference://ttd is registered", () => {
    expect(registered.has("graphql-reference://ttd")).toBe(true);
  });

  it.each(allResources.map((r) => [r.uri, r] as const))("%s", (_uri, resource) => {
    const text = String(resource.getContent());
    for (const match of text.matchAll(uriPattern)) {
      expect(registered, `unregistered URI ${match[0]}`).toContain(match[0]);
    }
  });
});

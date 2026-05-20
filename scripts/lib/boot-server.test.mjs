import { describe, it, expect } from "vitest";
import { withServerClient, listRawTools } from "./boot-server.mjs";

// Integration smoke test for the shared boot harness. Boots a real built MCP
// server (meta-mcp) in-process and confirms listRawTools returns raw wire
// tools with the `cesteral` annotation namespace intact — the stock SDK
// client.listTools() strips it, so this guards the identity-schema path that
// generate-manifests.mjs depends on. Requires `pnpm run build` first.
describe("boot-server harness", () => {
  it("listRawTools returns wire tools with the cesteral namespace intact", async () => {
    const tools = await withServerClient("meta-mcp", listRawTools);
    expect(tools.length).toBeGreaterThan(0);
    const governed = tools.filter((t) => t?.annotations?.cesteral).map((t) => t.name);
    expect(governed).toContain("meta_update_entity");
  }, 30000);
});

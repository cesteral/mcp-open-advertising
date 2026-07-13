import { describe, it, expect, afterEach, vi } from "vitest";

// Each case does `vi.resetModules()` + a cold `await import()` of the tools
// barrel, which transitively pulls in every tool definition plus
// @cesteral/shared. On a resource-constrained CI runner that cold transform can
// exceed the default 5s testTimeout, so give these import-heavy cases headroom.
const IMPORT_HEAVY_TIMEOUT_MS = 30_000;

// `allTools` reads MCP_INCLUDE_CONFORMANCE_TOOLS at module-eval time, so each
// case sets the env then imports the barrel fresh via a reset module registry.
afterEach(() => {
  vi.resetModules();
  delete process.env.MCP_INCLUDE_CONFORMANCE_TOOLS;
});

describe("msads allTools conformance wiring", () => {
  it(
    "omits conformance tools by default",
    async () => {
      vi.resetModules();
      delete process.env.MCP_INCLUDE_CONFORMANCE_TOOLS;
      const { allTools, productionTools } = await import("../src/mcp-server/tools/index.js");
      expect(allTools).toHaveLength(productionTools.length);
      expect(allTools.some((t) => t.name === "echo")).toBe(false);
    },
    IMPORT_HEAVY_TIMEOUT_MS
  );

  it(
    "includes conformance tools when MCP_INCLUDE_CONFORMANCE_TOOLS=true",
    async () => {
      vi.resetModules();
      process.env.MCP_INCLUDE_CONFORMANCE_TOOLS = "true";
      const { allTools, productionTools } = await import("../src/mcp-server/tools/index.js");
      expect(allTools.length).toBeGreaterThan(productionTools.length);
      expect(allTools.some((t) => t.name === "echo")).toBe(true);
      expect(allTools.some((t) => t.name === "test_simple_text")).toBe(true);
    },
    IMPORT_HEAVY_TIMEOUT_MS
  );
});

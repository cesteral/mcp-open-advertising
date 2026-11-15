// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, expect, it, vi } from "vitest";

vi.mock("../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: vi.fn(() => ({ boundAccountId: "1234567890" })),
}));

describe("{{package}} tool registration", () => {
  it("registers the management MUST tools and tool search", async () => {
    const { allTools } = await import("../src/mcp-server/tools/index.js");
    expect(allTools.map((t) => t.name).sort()).toEqual(
      [
        "{{key}}_list_entities",
        "{{key}}_get_entity",
        "{{key}}_create_entity",
        "{{key}}_update_entity",
        "{{key}}_delete_entity",
        "{{key}}_bulk_update_status",
        "{{key}}_validate_entity",
        "{{key}}_get_pacing_status",
        "{{key}}_search_tools",
      ].sort()
    );
  }, 30_000);

  it("every governed tool's contractId is built from its slugs", async () => {
    const { allTools } = await import("../src/mcp-server/tools/index.js");
    const governed = allTools
      .map((t) => (t.annotations as { cesteral?: Record<string, unknown> } | undefined)?.cesteral)
      .filter((c): c is Record<string, unknown> => c !== undefined);
    expect(governed.length).toBeGreaterThan(0);
    for (const c of governed) {
      expect(c.contractId).toBe(`${c.contractPlatformSlug}.${c.contractToolSlug}.v${c.schemaVersion}`);
      expect(c.contractPlatformSlug).toBe("{{key}}");
    }
  });

  it("a write stub fails, including on dry_run, instead of pretending to succeed", async () => {
    const { createEntityLogic } = await import(
      "../src/mcp-server/tools/definitions/create-entity.tool.js"
    );
    await expect(
      createEntityLogic(
        { entityType: "campaign", accountId: "1234567890", data: {}, dry_run: true },
        {} as never
      )
    ).rejects.toThrow(/scaffold stub/);
  });
});

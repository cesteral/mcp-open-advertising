// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { beforeAll, describe, expect, it, vi } from "vitest";
import type { ToolDefinitionForFactory } from "@cesteral/shared";

vi.mock("../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: vi.fn(() => ({ boundAccountId: "1234567890" })),
}));

describe("{{package}} tool registration", () => {
  // One cold import of the tool barrel pulls in every definition and
  // @cesteral/shared; on a loaded machine that alone can pass 5s.
  let allTools: ToolDefinitionForFactory[];
  beforeAll(async () => {
    ({ allTools } = await import("../src/mcp-server/tools/index.js"));
  }, 120_000);

  it("registers the management MUST tools, account discovery and tool search", () => {
    expect(allTools.map((t) => t.name).sort()).toEqual(
      [
        "{{key}}_list_accounts",
        "{{key}}_list_entities",
        "{{key}}_get_entity",
        // {{#writes}}
        "{{key}}_create_entity",
        "{{key}}_update_entity",
        "{{key}}_delete_entity",
        "{{key}}_bulk_update_status",
        // {{/writes}}
        "{{key}}_validate_entity",
        "{{key}}_get_pacing_status",
        "{{key}}_search_tools",
      ].sort()
    );
  });

  // {{^writes}}
  it("ships no write tool and no governance block while it is read-only", () => {
    // governed: false is allowed only for a server with no write tool
    // (scripts/lib/governed-packages.test.mjs). Add writes with
    // `pnpm new:server {{key}} --add-write-stubs`.
    for (const t of allTools) {
      const a = t.annotations as { readOnlyHint?: boolean; cesteral?: unknown } | undefined;
      expect(a?.readOnlyHint, t.name).not.toBe(false);
      expect(a?.cesteral, t.name).toBeUndefined();
    }
  });
  // {{/writes}}

  // {{#writes}}
  it("every governed tool's contractId is built from its slugs", () => {
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
  // {{/writes}}
});

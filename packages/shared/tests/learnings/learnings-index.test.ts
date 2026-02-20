import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import {
  loadLearningsIndex,
  queryIndex,
  rebuildLearningsIndex,
} from "../../src/learnings/learnings-index.js";

const tempRoots: string[] = [];

function createRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "shared-learnings-index-"));
  tempRoots.push(root);
  mkdirSync(join(root, "workflows"), { recursive: true });
  mkdirSync(join(root, "platforms", "ttd"), { recursive: true });
  return root;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("learnings index", () => {
  it("rebuilds and queries entries by tool and workflow", () => {
    const root = createRoot();

    writeFileSync(
      join(root, "workflows", "troubleshooting.md"),
      "# troubleshooting\n\n## Narrow update masks\n- **Date**: 2026-02-19\n- **Applies to**: ttd_update_entity,mcp.execute.ttd_entity_update\n",
      "utf-8"
    );

    writeFileSync(
      join(root, "platforms", "ttd", "api-gotchas.md"),
      "# api-gotchas\n\n## Include advertiserId on create\n- **Date**: 2026-02-19\n- **Applies to**: ttd_create_entity\n",
      "utf-8"
    );

    const index = rebuildLearningsIndex(root);
    expect(index.entries.length).toBe(2);

    const loaded = loadLearningsIndex(root);
    expect(loaded).not.toBeNull();

    const byTool = queryIndex(index, { tool: "ttd_create_entity" });
    expect(byTool.length).toBe(1);
    expect(byTool[0].heading).toContain("advertiserId");

    const byWorkflow = queryIndex(index, { workflow: "troubleshooting" });
    expect(byWorkflow.length).toBe(1);
    expect(byWorkflow[0].workflow).toBe("troubleshooting");
  });
});

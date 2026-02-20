import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { createSubmitLearningLogic } from "../../src/learnings/submit-learning.tool.js";
import { loadLearningsIndex } from "../../src/learnings/learnings-index.js";

const tempRoots: string[] = [];

function createLearningsRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "shared-submit-learning-"));
  tempRoots.push(root);
  mkdirSync(join(root, "workflows"), { recursive: true });
  mkdirSync(join(root, "platforms", "ttd"), { recursive: true });
  mkdirSync(join(root, "agent-behaviors"), { recursive: true });
  return root;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("submit_learning tool logic", () => {
  it("appends entries, includes source interaction ids, and rebuilds index", async () => {
    const learningsRoot = createLearningsRoot();
    const logic = createSubmitLearningLogic(learningsRoot);

    const result = await logic({
      category: "workflow",
      subcategory: "troubleshooting",
      title: "Use smaller update masks when retries spike",
      content: "Large update masks correlated with retries in a troubleshooting workflow.",
      recommendation: "Narrow update masks and retry with targeted field sets.",
      appliesTo: "ttd_update_entity,mcp.execute.ttd_entity_update",
      sourceInteractionIds: ["a1", "a2"],
      force: false,
    });

    expect(result.success).toBe(true);

    const targetPath = join(learningsRoot, "workflows", "troubleshooting.md");
    expect(existsSync(targetPath)).toBe(true);

    const content = readFileSync(targetPath, "utf-8");
    expect(content).toContain("## Use smaller update masks when retries spike");
    expect(content).toContain("- **Source interactions**: a1, a2");

    const index = loadLearningsIndex(learningsRoot);
    expect(index).not.toBeNull();
    expect(index?.entries.some((entry) => entry.heading.includes("smaller update masks"))).toBe(true);
  });

  it("detects duplicates unless force=true", async () => {
    const learningsRoot = createLearningsRoot();
    const existingFile = join(learningsRoot, "workflows", "campaign-setup.md");
    writeFileSync(
      existingFile,
      "# campaign-setup\n\n## Existing Campaign Setup Tip\n- **Date**: 2026-02-19\n- **Source**: test\n- **Context**: existing\n",
      "utf-8"
    );

    const logic = createSubmitLearningLogic(learningsRoot);

    const duplicateResult = await logic({
      category: "workflow",
      subcategory: "campaign-setup",
      title: "Existing Campaign Setup Tip",
      content: "Should be treated as duplicate.",
      force: false,
    });

    expect(duplicateResult.success).toBe(false);
    expect(duplicateResult.duplicateOf).toBe("Existing Campaign Setup Tip");

    const forcedResult = await logic({
      category: "workflow",
      subcategory: "campaign-setup",
      title: "Existing Campaign Setup Tip",
      content: "Forced duplicate insertion.",
      force: true,
    });

    expect(forcedResult.success).toBe(true);

    const updatedContent = readFileSync(existingFile, "utf-8");
    const headingCount = (updatedContent.match(/^## Existing Campaign Setup Tip$/gm) ?? []).length;
    expect(headingCount).toBe(2);
  });
});

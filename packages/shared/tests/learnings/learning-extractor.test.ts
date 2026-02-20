import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { EvaluatorIssueClass } from "../../src/utils/mcp-errors.js";
import { LearningExtractor } from "../../src/learnings/learning-extractor.js";
import { loadLearningsIndex } from "../../src/learnings/learnings-index.js";

const tempRoots: string[] = [];

function createRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "shared-learning-extractor-"));
  tempRoots.push(root);
  mkdirSync(root, { recursive: true });
  return root;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("LearningExtractor", () => {
  it("writes an auto-generated learning when threshold is reached", () => {
    const root = createRoot();
    const extractor = new LearningExtractor({
      learningsRoot: root,
      dataDir: join(root, "data"),
      threshold: 2,
    });

    extractor.processEvaluation("ttd_update_entity", [
      {
        class: EvaluatorIssueClass.InputQuality,
        message: "Payload had too many mutable fields",
        isRecoverable: true,
      },
    ]);

    const filePath = join(root, "auto-generated", "ttd_update_entity-input_quality.md");
    expect(existsSync(filePath)).toBe(false);

    extractor.processEvaluation("ttd_update_entity", [
      {
        class: EvaluatorIssueClass.InputQuality,
        message: "Payload had too many mutable fields",
        isRecoverable: true,
      },
    ]);

    expect(existsSync(filePath)).toBe(true);

    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("Auto-extracted (2 occurrences)");
    expect(content).toContain("input_quality pattern detected for ttd_update_entity");

    const index = loadLearningsIndex(root);
    expect(index).not.toBeNull();
    expect(index?.entries.some((entry) => entry.file.includes("auto-generated"))).toBe(true);
  });
});

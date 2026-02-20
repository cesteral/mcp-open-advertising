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
  it("writes an auto-generated learning when threshold is reached", async () => {
    const root = createRoot();
    const extractor = new LearningExtractor({
      learningsRoot: root,
      dataDir: join(root, "data"),
      threshold: 2,
    });

    await extractor.processEvaluation("ttd_update_entity", [
      {
        class: EvaluatorIssueClass.InputQuality,
        message: "Payload had too many mutable fields",
        isRecoverable: true,
      },
    ]);

    const filePath = join(root, "auto-generated", "ttd_update_entity-input_quality.md");
    expect(existsSync(filePath)).toBe(false);

    await extractor.processEvaluation("ttd_update_entity", [
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

  it("writes counts and learnings via storage backend when provided", async () => {
    const files = new Map<string, string>();
    const backend = {
      type: "local" as const,
      async readFile(path: string): Promise<string | null> {
        return files.get(path) ?? null;
      },
      async writeFile(path: string, content: string): Promise<void> {
        files.set(path, content);
      },
      async appendFile(path: string, content: string): Promise<void> {
        files.set(path, (files.get(path) ?? "") + content);
      },
      async exists(path: string): Promise<boolean> {
        return files.has(path);
      },
      async listFiles(prefix: string, extension?: string): Promise<string[]> {
        return Array.from(files.keys()).filter((path) => {
          if (!path.startsWith(prefix)) return false;
          if (extension && !path.endsWith(extension)) return false;
          return true;
        });
      },
      async mkdir(_path: string): Promise<void> {
        // no-op
      },
    };

    const root = createRoot();
    const extractor = new LearningExtractor({
      learningsRoot: root,
      dataDir: join(root, "data"),
      threshold: 2,
      storageBackend: backend,
    });

    await extractor.processEvaluation("ttd_update_entity", [
      {
        class: EvaluatorIssueClass.InputQuality,
        message: "Payload had too many mutable fields",
        isRecoverable: true,
      },
    ]);
    await extractor.processEvaluation("ttd_update_entity", [
      {
        class: EvaluatorIssueClass.InputQuality,
        message: "Payload had too many mutable fields",
        isRecoverable: true,
      },
    ]);

    expect(files.has("learnings/issue-counts.json")).toBe(true);
    expect(files.has("learnings/auto-generated/ttd_update_entity-input_quality.md")).toBe(true);
    expect(files.has("learnings/index.json")).toBe(true);
  });
});

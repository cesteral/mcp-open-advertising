import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createFindingStore } from "../../src/utils/finding-store.js";
import { EvaluatorIssueClass } from "../../src/utils/mcp-errors.js";
import type { PersistedFinding } from "../../src/utils/finding-types.js";

const tempDirs: string[] = [];

function tempFilePath(): string {
  const dir = mkdtempSync(join(tmpdir(), "shared-finding-store-"));
  tempDirs.push(dir);
  return join(dir, "findings.jsonl");
}

function mockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as any;
}

function buildFinding(overrides: Partial<PersistedFinding>): PersistedFinding {
  return {
    id: overrides.id ?? randomUUID(),
    sessionId: overrides.sessionId ?? "session-1",
    timestamp: overrides.timestamp ?? new Date().toISOString(),
    toolName: overrides.toolName ?? "ttd_update_entity",
    workflowId: overrides.workflowId ?? "mcp.execute.ttd_entity_update",
    platform: overrides.platform ?? "ttd",
    serverPackage: overrides.serverPackage ?? "ttd-mcp",
    issues: overrides.issues ?? [],
    inputQualityScore: overrides.inputQualityScore,
    efficiencyScore: overrides.efficiencyScore,
    recommendationAction: overrides.recommendationAction ?? "none",
    durationMs: overrides.durationMs ?? 10,
  };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("createFindingStore", () => {
  it("appends and queries persisted findings", async () => {
    const store = createFindingStore({
      filePath: tempFilePath(),
      logger: mockLogger(),
    });

    await store.append([
      buildFinding({
        id: "f1",
        issues: [
          {
            class: EvaluatorIssueClass.InputQuality,
            message: "Too many payload fields",
          },
        ],
      }),
      buildFinding({
        id: "f2",
        workflowId: "mcp.execute.ttd_reporting",
        issues: [
          {
            class: EvaluatorIssueClass.Efficiency,
            message: "Tool latency exceeded threshold",
          },
        ],
      }),
    ]);

    const all = await store.query();
    expect(all.length).toBe(2);

    const filtered = await store.query({ workflowId: "mcp.execute.ttd_reporting" });
    expect(filtered.length).toBe(1);
    expect(filtered[0].id).toBe("f2");
  });

  it("builds patterns and summary", async () => {
    const store = createFindingStore({
      filePath: tempFilePath(),
      logger: mockLogger(),
    });

    await store.append([
      buildFinding({
        id: "p1",
        issues: [
          {
            class: EvaluatorIssueClass.InputQuality,
            message: "Payload has 31 fields",
          },
        ],
      }),
      buildFinding({
        id: "p2",
        issues: [
          {
            class: EvaluatorIssueClass.InputQuality,
            message: "Payload has 28 fields",
          },
        ],
      }),
      buildFinding({
        id: "p3",
        issues: [
          {
            class: EvaluatorIssueClass.InputQuality,
            message: "Payload has 22 fields",
          },
        ],
      }),
    ]);

    const patterns = await store.getPatterns({ minOccurrences: 3 });
    expect(patterns.length).toBe(1);
    expect(patterns[0].occurrenceCount).toBe(3);

    const summary = await store.getSummary();
    expect(summary.totalFindings).toBe(3);
    expect(summary.findingsByClass[EvaluatorIssueClass.InputQuality]).toBe(3);
    expect(summary.topPatterns.length).toBe(1);
  });

  it("prunes findings older than retention window", async () => {
    const filePath = tempFilePath();
    const store = createFindingStore({
      filePath,
      retentionDays: 1,
      logger: mockLogger(),
    });

    const oldTs = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const freshTs = new Date().toISOString();

    await store.append([
      buildFinding({ id: "old", timestamp: oldTs }),
      buildFinding({ id: "fresh", timestamp: freshTs }),
    ]);

    const removed = await store.prune();
    expect(removed).toBe(1);

    const remaining = await store.query();
    expect(remaining.map((item) => item.id)).toEqual(["fresh"]);

    const fileContent = readFileSync(filePath, "utf-8");
    expect(fileContent).toContain("fresh");
    expect(fileContent).not.toContain('"old"');
  });
});

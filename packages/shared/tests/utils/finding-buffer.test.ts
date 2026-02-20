import { describe, expect, it } from "vitest";
import { createFindingBuffer } from "../../src/utils/finding-buffer.js";
import type { PersistedFinding } from "../../src/utils/finding-types.js";

function finding(id: string, workflowId = "wf-1"): PersistedFinding {
  return {
    id,
    sessionId: "s-1",
    timestamp: new Date().toISOString(),
    toolName: "tool_a",
    workflowId,
    platform: "ttd",
    serverPackage: "ttd-mcp",
    issues: [],
    recommendationAction: "none",
    durationMs: 5,
  };
}

describe("createFindingBuffer", () => {
  it("keeps chronological order and evicts oldest entries when full", () => {
    const buffer = createFindingBuffer(2);

    buffer.push(finding("a"));
    buffer.push(finding("b"));
    buffer.push(finding("c"));

    expect(buffer.size()).toBe(2);
    expect(buffer.getAll().map((item) => item.id)).toEqual(["b", "c"]);
  });

  it("supports workflow filtering and clear", () => {
    const buffer = createFindingBuffer(5);

    buffer.push(finding("a", "wf-1"));
    buffer.push(finding("b", "wf-2"));

    expect(buffer.getByWorkflow("wf-2").map((item) => item.id)).toEqual(["b"]);

    const flushed = buffer.clear();
    expect(flushed.map((item) => item.id)).toEqual(["a", "b"]);
    expect(buffer.size()).toBe(0);
  });
});

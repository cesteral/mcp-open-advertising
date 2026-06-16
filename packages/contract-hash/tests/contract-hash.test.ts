import { describe, it, expect } from "vitest";
import { computeDefinitionHash } from "../src/index.js";

// Golden vectors. These hashes are the cross-repo contract: governance's
// canonical-hash test suite MUST pin the identical values. Changing the
// algorithm is a coordinated change in both repos.
describe("computeDefinitionHash", () => {
  it("hashes a minimal tool (name only) to a known value", () => {
    expect(computeDefinitionHash({ name: "minimal_tool" })).toBe(
      "c841d980fe5ee2e43ed269187186e58b215204f11c6780b95c2bb794f01c3ef1"
    );
  });

  const demoTool = {
    name: "demo_tool",
    description: "A demo.",
    inputSchema: {
      type: "object",
      properties: { beta: { type: "string" }, alpha: { type: "number" } },
    },
    annotations: {
      readOnlyHint: true,
      cesteral: { kind: "read", contractId: "demo.get.v1" },
    },
  };

  it("hashes a representative tool to a known value", () => {
    expect(computeDefinitionHash(demoTool)).toBe(
      "3a16ab4f8402beec8813d0d46a87c0fe99c9d86a258d854cba995f57d1948b8b"
    );
  });

  it("is invariant to deep key ordering", () => {
    const reordered = {
      annotations: {
        cesteral: { contractId: "demo.get.v1", kind: "read" },
        readOnlyHint: true,
      },
      inputSchema: {
        properties: { alpha: { type: "number" }, beta: { type: "string" } },
        type: "object",
      },
      description: "A demo.",
      name: "demo_tool",
    };
    expect(computeDefinitionHash(reordered)).toBe(computeDefinitionHash(demoTool));
  });

  it("is sensitive to outputSchema", () => {
    const withOutput = { ...demoTool, outputSchema: { type: "object" } };
    expect(computeDefinitionHash(withOutput)).not.toBe(computeDefinitionHash(demoTool));
  });

  it("ignores non-governance fields (title, _meta, execution)", () => {
    const withExtra = { ...demoTool, title: "ignored", _meta: { x: 1 }, execution: {} };
    expect(computeDefinitionHash(withExtra)).toBe(computeDefinitionHash(demoTool));
  });

  it("treats an undefined optional field as absent", () => {
    expect(computeDefinitionHash({ name: "minimal_tool", description: undefined })).toBe(
      computeDefinitionHash({ name: "minimal_tool" })
    );
  });

  // Fail-loud parity with hashActionInput: non-JSON values in the projection
  // throw rather than silently coercing to a wrong-but-stable hash. The inputs
  // never occur on the wire-JSON `tools/list` path, but a non-wire caller now
  // gets a loud failure instead of a divergent hash.
  it("throws on a NaN nested in a governance field", () => {
    expect(() =>
      computeDefinitionHash({ name: "bad_tool", inputSchema: { default: Number.NaN } })
    ).toThrow();
  });

  it("throws on a BigInt nested in annotations", () => {
    expect(() =>
      computeDefinitionHash({ name: "bad_tool", annotations: { cesteral: { schemaVersion: 1n } } })
    ).toThrow();
  });
});

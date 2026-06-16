import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Cross-repo drift guard for the release workflow's identity.
 *
 * The downstream governance repo (cesteral-governance-layer) pins this exact
 * workflow path and tag-trigger shape in its provenance signer check
 * (lib/features/governance/attestation/expected-signers.ts ->
 * CESTERAL_MCP_SIGNER_PIN). Provenance is signed with the workflow's identity,
 * so renaming this file or changing its `vX.Y.Z` tag trigger would flip every
 * published @cesteral/*-mcp package to `signer_mismatch` downstream and silently
 * de-attest the fleet.
 *
 * If this test fails, you changed the release workflow's path or trigger:
 * update `workflowPath` / `workflowRefPattern` in the governance pin in the SAME
 * coordinated change, then update the constants below.
 */
const PINNED_WORKFLOW_PATH = ".github/workflows/release.yml";
// Mirrors governance's workflowRefPattern: /^refs\/tags\/v\d+\.\d+\.\d+$/
const PINNED_TAG_TRIGGER = "v[0-9]+.[0-9]+.[0-9]+";

describe("release workflow identity pin (downstream provenance contract)", () => {
  it("the release workflow still lives at the path governance pins", () => {
    const url = new URL(`../../${PINNED_WORKFLOW_PATH}`, import.meta.url);
    expect(() => readFileSync(url, "utf8")).not.toThrow();
  });

  it("still triggers on the vX.Y.Z tag shape governance's signer pin expects", () => {
    const yaml = readFileSync(new URL(`../../${PINNED_WORKFLOW_PATH}`, import.meta.url), "utf8");
    expect(yaml).toContain(PINNED_TAG_TRIGGER);
  });
});

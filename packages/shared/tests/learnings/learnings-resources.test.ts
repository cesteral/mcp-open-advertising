import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { createLearningsResources } from "../../src/learnings/learnings-resources.js";

const tempRoots: string[] = [];

function createRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "shared-learnings-resources-"));
  tempRoots.push(root);
  mkdirSync(join(root, "platforms", "ttd"), { recursive: true });
  mkdirSync(join(root, "workflows"), { recursive: true });
  mkdirSync(join(root, "agent-behaviors"), { recursive: true });
  mkdirSync(join(root, "auto-generated"), { recursive: true });
  return root;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("createLearningsResources", () => {
  it("includes auto-generated resource and supports ?tool= filtering", async () => {
    const root = createRoot();

    writeFileSync(
      join(root, "platforms", "ttd", "api-gotchas.md"),
      [
        "# api-gotchas",
        "",
        "## Matching Platform Entry",
        "- **Date**: 2026-02-19",
        "- **Applies to**: ttd_create_entity",
        "",
        "## Non Matching Platform Entry",
        "- **Date**: 2026-02-19",
        "- **Applies to**: ttd_get_report",
        "",
      ].join("\n"),
      "utf-8"
    );

    writeFileSync(
      join(root, "auto-generated", "ttd_create_entity-input_quality.md"),
      [
        "# Auto-Generated",
        "",
        "## Auto Generated Entry",
        "- **Date**: 2026-02-19",
        "- **Applies to**: ttd_create_entity",
        "",
      ].join("\n"),
      "utf-8"
    );

    const resources = createLearningsResources({
      learningsRoot: root,
      serverPlatform: "ttd",
    });

    expect(resources.some((resource) => resource.uri === "learnings://auto-generated")).toBe(true);

    const platformResource = resources.find((resource) => resource.uri === "learnings://platforms/ttd");
    expect(platformResource).toBeDefined();

    const filteredPlatformContent = await Promise.resolve(
      platformResource!.getContent(new URL("learnings://platforms/ttd?tool=ttd_create_entity"))
    );
    expect(filteredPlatformContent).toContain("Matching Platform Entry");
    expect(filteredPlatformContent).not.toContain("Non Matching Platform Entry");

    const allResource = resources.find((resource) => resource.uri === "learnings://all");
    expect(allResource).toBeDefined();

    const filteredAllContent = await Promise.resolve(
      allResource!.getContent(new URL("learnings://all?tool=ttd_create_entity"))
    );
    expect(filteredAllContent).toContain("Auto Generated Entry");
  });
});

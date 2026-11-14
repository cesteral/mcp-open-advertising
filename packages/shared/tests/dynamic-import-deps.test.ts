import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// `await import(moduleName)` with a string variable is invisible to TypeScript,
// the lockfile and the image scan, so a package loaded that way can be missing
// from a production install without any check noticing. The Firestore jti store
// and the GCS spill/logging paths shipped like that: `pnpm deploy --prod` had no
// reason to include them. This pins every such name to a declared dependency.

const srcDir = join(__dirname, "..", "src");
const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8"));
const declared = new Set<string>([
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.optionalDependencies ?? {}),
]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? sourceFiles(full) : full.endsWith(".ts") ? [full] : [];
  });
}

describe("dynamically imported packages", () => {
  const found = new Map<string, string>();
  for (const file of sourceFiles(srcDir)) {
    for (const m of readFileSync(file, "utf8").matchAll(/moduleName\s*=\s*"([^"]+)"/g)) {
      found.set(m[1], file);
    }
  }

  it("finds the known dynamic imports (guards the scan itself)", () => {
    expect([...found.keys()]).toEqual(
      expect.arrayContaining(["@google-cloud/firestore", "@google-cloud/storage"])
    );
  });

  it.each([...found.entries()])("%s is a declared dependency", (name) => {
    expect(declared.has(name)).toBe(true);
  });
});

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, chmodSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = path.join(REPO_ROOT, "scripts", "publish-all.sh");

/**
 * The `contract-v*` release lane publishes @cesteral/contract-hash and
 * @cesteral/contract-schema, which version independently. A tag that fixes one
 * finds the other already on npm; contract-v2.3.0 and contract-v2.3.1 both went
 * red on that, with the changed library having published. The lane must
 * tolerate an already-published library, and must still fail a tag that
 * publishes neither (#171: a no-op release that looks successful).
 *
 * The full script needs real tarballs to get as far as publishing, so this
 * extracts the publish helper and the two publish calls plus their verdict and
 * runs just that against a stub `pnpm`.
 */
const src = readFileSync(SCRIPT, "utf8");
const START = "NPM_PUBLISH_FAILURES=()";
const END = "# --- Contracts-only lane stops here ---";

let dir;
let harness;

beforeAll(() => {
  const start = src.indexOf(START);
  const end = src.indexOf(END);
  if (start < 0 || end < start) {
    throw new Error("publish-all.sh no longer has the markers this test extracts from");
  }
  dir = mkdtempSync(path.join(tmpdir(), "publish-lane-"));
  harness = path.join(dir, "harness.sh");
  writeFileSync(
    harness,
    [
      "set -euo pipefail",
      'log() { echo "==> $*"; }',
      'err() { echo "ERROR: $*" >&2; exit 1; }',
      "PROVENANCE=false",
      "DRY_RUN=${DRY_RUN:-false}",
      "CONTRACTS_ONLY=${CONTRACTS_ONLY:-true}",
      src.slice(start, end),
      'echo "VERDICT_OK"',
    ].join("\n")
  );
  // Stub pnpm: `publish` is "already published" for the package named in
  // ALREADY (comma separated), a clean publish otherwise, a hard failure for FAIL.
  writeFileSync(
    path.join(dir, "pnpm"),
    [
      "#!/usr/bin/env bash",
      'name=$(basename "$PWD")',
      'if [ "$name" = "${FAIL:-}" ]; then echo "npm error code E500" >&2; exit 1; fi',
      'case ",${ALREADY:-}," in *",$name,"*)',
      '  echo "npm error You cannot publish over the previously published versions: 1.0.0." >&2; exit 1;;',
      "esac",
      'echo "+ published $name"',
      "exit 0",
    ].join("\n")
  );
  chmodSync(path.join(dir, "pnpm"), 0o755);
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

function run(extraEnv) {
  const res = spawnSync("bash", [harness], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, ...extraEnv },
  });
  return { code: res.status, out: `${res.stdout ?? ""}${res.stderr ?? ""}` };
}

describe("contracts-only lane: already-published tolerance", () => {
  it("passes when only one library is new (contract-hash already on npm)", () => {
    const r = run({ ALREADY: "contract-hash" });
    expect(r.code).toBe(0);
    expect(r.out).toContain("VERDICT_OK");
    expect(r.out).toContain("@cesteral/contract-hash already published");
  });

  it("passes when only the other library is new", () => {
    const r = run({ ALREADY: "contract-schema" });
    expect(r.code).toBe(0);
    expect(r.out).toContain("VERDICT_OK");
  });

  it("passes when both are new", () => {
    const r = run({});
    expect(r.code).toBe(0);
    expect(r.out).toContain("VERDICT_OK");
  });

  it("fails when both are already published: the tag shipped nothing (#171)", () => {
    const r = run({ ALREADY: "contract-hash,contract-schema" });
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("Neither contract library was newly published");
    expect(r.out).not.toContain("VERDICT_OK");
  });

  it("still fails a real publish error, even when the other library is new", () => {
    const r = run({ FAIL: "contract-schema", ALREADY: "contract-hash" });
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("A contract library publish failed");
    expect(r.out).not.toContain("VERDICT_OK");
  });

  it("does not apply the nothing-published check to a dry run", () => {
    const r = run({ DRY_RUN: "true", ALREADY: "contract-hash,contract-schema" });
    expect(r.code).toBe(0);
    expect(r.out).toContain("VERDICT_OK");
  });

  it("keeps the fleet lane idempotent when nothing is new", () => {
    const r = run({ CONTRACTS_ONLY: "false", ALREADY: "contract-hash,contract-schema" });
    expect(r.code).toBe(0);
    expect(r.out).toContain("VERDICT_OK");
  });
});

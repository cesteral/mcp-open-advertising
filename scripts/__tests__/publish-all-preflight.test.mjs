import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, chmodSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = path.join(REPO_ROOT, "scripts", "publish-all.sh");

/**
 * Pre-flight gating in `publish-all.sh`.
 *
 * Regression cover for the contracts-only release lane demanding a tool it never
 * uses. `--contracts-only` publishes the two leaf contract libraries and exits
 * before the MCP Registry step — neither package is an MCP server — but the
 * pre-flight still required the `mcp-publisher` binary, so the lane failed hard
 * in CI, where `release-contracts` deliberately does not install it.
 *
 * The local rehearsal could not catch this: `--dry-run` already skipped the
 * check, so the only way to exercise it is a NON-dry run. These tests do that by
 * putting a stub `pnpm` on PATH that exits non-zero, letting the script get past
 * pre-flight and then die harmlessly at the build step. What matters is *which*
 * error comes out.
 */

let stubDir;
let env;

beforeAll(() => {
  stubDir = mkdtempSync(path.join(tmpdir(), "publish-preflight-"));

  // `npm whoami` must succeed so we reach the checks under test.
  writeFileSync(
    path.join(stubDir, "npm"),
    '#!/usr/bin/env bash\nif [ "$1" = "whoami" ]; then echo stub-user; exit 0; fi\nexit 0\n'
  );
  // Fail at the build step — far enough past pre-flight to prove it passed,
  // without running a real build or touching the network.
  writeFileSync(
    path.join(stubDir, "pnpm"),
    '#!/usr/bin/env bash\necho "STUB_PNPM_REACHED" >&2\nexit 9\n'
  );
  for (const f of ["npm", "pnpm"]) chmodSync(path.join(stubDir, f), 0o755);

  // The script requires a real `node`. Symlink it INTO the stub dir rather than
  // widening PATH to wherever node lives — that directory may also contain a
  // real `mcp-publisher`, which would make these tests pass for the wrong reason
  // on a maintainer's machine while still failing in CI.
  symlinkSync(process.execPath, path.join(stubDir, "node"));

  // Deliberately NO mcp-publisher on PATH.
  env = { ...process.env, PATH: `${stubDir}:/usr/bin:/bin` };
});

afterAll(() => rmSync(stubDir, { recursive: true, force: true }));

function run(args) {
  const res = spawnSync("bash", [SCRIPT, ...args], { env, encoding: "utf8", cwd: REPO_ROOT });
  return `${res.stdout ?? ""}${res.stderr ?? ""}`;
}

describe("publish-all.sh pre-flight", () => {
  it("does not require mcp-publisher for --contracts-only", () => {
    const out = run(["--contracts-only"]);

    expect(out).not.toContain("mcp-publisher is not installed");
    // Proves we got past pre-flight rather than passing for the wrong reason.
    expect(out).toContain("STUB_PNPM_REACHED");
  });

  it("still requires mcp-publisher for a full fleet release", () => {
    const out = run([]);

    // The fleet lane DOES publish to the MCP Registry, so the tool is required
    // and must be checked up front rather than after npm publishes have landed.
    expect(out).toContain("mcp-publisher is not installed");
    expect(out).not.toContain("STUB_PNPM_REACHED");
  });

  it("does not require mcp-publisher for --npm-only", () => {
    const out = run(["--npm-only"]);

    expect(out).not.toContain("mcp-publisher is not installed");
    expect(out).toContain("STUB_PNPM_REACHED");
  });

  it("skips the npm auth check on --dry-run so a release can be rehearsed", () => {
    // Stub npm whoami to FAIL, proving the check is gated rather than passing.
    writeFileSync(path.join(stubDir, "npm"), "#!/usr/bin/env bash\nexit 1\n");
    chmodSync(path.join(stubDir, "npm"), 0o755);

    const out = run(["--dry-run", "--contracts-only"]);

    expect(out).not.toContain("Not logged in to npm");
  });
});

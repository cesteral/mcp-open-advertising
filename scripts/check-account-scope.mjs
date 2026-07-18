#!/usr/bin/env node

/**
 * Fails CI when a single-account tool reads a session-bound account id but does
 * not call `assertAccountScope()` to check the caller-supplied scope parameter
 * against it. Without that check a caller can name account B while the session
 * is bound to account A and have the call (including writes) execute against A.
 *
 * The audit rule and rationale live in ./lib/account-scope-audit.mjs. This
 * runner just collects the tool source files and reports violations.
 *
 * Usage: node scripts/check-account-scope.mjs
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { auditAccountScopeCoverage } from "./lib/account-scope-audit.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PACKAGES = join(ROOT, "packages");

function collectToolFiles() {
  const files = [];
  for (const pkg of readdirSync(PACKAGES)) {
    const dir = join(PACKAGES, pkg, "src", "mcp-server", "tools", "definitions");
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".tool.ts")) continue;
      const abs = join(dir, name);
      files.push({ path: abs.slice(ROOT.length + 1), source: readFileSync(abs, "utf-8") });
    }
  }
  return files;
}

const files = collectToolFiles();
const violations = auditAccountScopeCoverage(files);

if (violations.length > 0) {
  console.error(
    "check:account-scope FAILED — these tools read a session-bound account id but\n" +
      "never call assertAccountScope(), so a caller-supplied scope parameter\n" +
      "(advertiserId / profileId / adAccountId / ...) is silently ignored and the\n" +
      "call executes against the session-bound account:\n"
  );
  for (const v of violations) {
    console.error(`  ✗ ${v.path}  (binds: ${v.boundVars.join(", ")})`);
  }
  console.error(
    "\nFix: after resolving session services, call\n" +
      '  assertAccountScope(input.<param>, <boundVar>, "<param>")\n' +
      "or, if the tool legitimately operates without a caller-supplied scope param,\n" +
      "add a comment containing `account-scope-audit-exempt` with justification."
  );
  process.exit(1);
}

console.log(`check:account-scope OK — ${files.length} tool files scanned, all covered.`);

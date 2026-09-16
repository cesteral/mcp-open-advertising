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
import {
  auditAccountScopeCoverage,
  auditSessionBoundScopeCoverage,
  extractSessionBoundKeys,
} from "./lib/account-scope-audit.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PACKAGES = join(ROOT, "packages");

/**
 * Scope keys each package's session binds, from its `SessionServices` interface.
 *
 * A package whose interface cannot be parsed is a hard error, not "no binding":
 * silently degrading to zero keys would disable the session-contract rule on a
 * rename, which is precisely the kind of quiet blind spot this rule exists to
 * close.
 */
function collectBoundKeysByPackage() {
  const byPackage = new Map();
  for (const pkg of readdirSync(PACKAGES)) {
    const abs = join(PACKAGES, pkg, "src", "services", "session-services.ts");
    if (!existsSync(abs)) continue;
    const keys = extractSessionBoundKeys(readFileSync(abs, "utf-8"));
    if (keys === null) {
      console.error(
        `check:account-scope FAILED — could not find \`export interface SessionServices\` in\n` +
          `  packages/${pkg}/src/services/session-services.ts\n\n` +
          "The session-contract rule reads that interface to learn which caller-supplied scope\n" +
          "keys the session binds. Update the parser rather than leaving the rule silently off."
      );
      process.exit(1);
    }
    byPackage.set(pkg, keys);
  }
  return byPackage;
}

function collectToolFiles(boundKeysByPackage) {
  const files = [];
  for (const pkg of readdirSync(PACKAGES)) {
    const dir = join(PACKAGES, pkg, "src", "mcp-server", "tools", "definitions");
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".tool.ts")) continue;
      const abs = join(dir, name);
      files.push({
        path: abs.slice(ROOT.length + 1),
        source: readFileSync(abs, "utf-8"),
        boundKeys: boundKeysByPackage.get(pkg) ?? [],
      });
    }
  }
  return files;
}

const boundKeysByPackage = collectBoundKeysByPackage();
const files = collectToolFiles(boundKeysByPackage);
const violations = auditAccountScopeCoverage(files);
const sessionViolations = auditSessionBoundScopeCoverage(files);

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

if (sessionViolations.length > 0) {
  console.error(
    "check:account-scope FAILED — these tools let the caller name an account that their\n" +
      "package's session is already bound to, but never reconcile the two. The call\n" +
      "executes against the session-bound account regardless of what the caller named:\n"
  );
  for (const v of sessionViolations) {
    console.error(`  ✗ ${v.path}  (declares: ${v.keys.join(", ")})`);
  }
  console.error(
    "\nThese are invisible to the rule above when the handler keeps the binding in the\n" +
      "resolved service instead of a `bound<Account>Id` local — the shape that reached\n" +
      "production in the Amazon commitment tools (#195).\n\n" +
      "Fix: after resolving session services, call\n" +
      '  assertAccountScope(input.<param>, bound<Param>, "<param>")\n' +
      "or add a comment containing `account-scope-audit-exempt` with justification."
  );
  process.exit(1);
}

const bound = [...boundKeysByPackage.entries()].filter(([, k]) => k.length);
console.log(
  `check:account-scope OK — ${files.length} tool files scanned, all covered ` +
    `(${bound.length} package(s) bind a session scope: ${bound.map(([p, k]) => `${p}:${k.join("/")}`).join(", ")}).`
);

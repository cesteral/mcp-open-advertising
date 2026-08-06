// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Authorization-model classification audit (pure logic).
 *
 * Security review C-2. Both scope checks in this codebase are opt-in and
 * key-driven: the JWT advertiser check only fires for keys listed in
 * `SCOPED_ID_KEYS`, and `assertAccountScope` only fires where a handler
 * remembers to call it. A tool whose scope parameter is named something
 * unexpected — or which takes no parameter at all — skips both and executes.
 *
 * The original C-2 remedy was to widen the key list. That treats the symptom:
 * an allowlist still fails open on the next unknown key, and says nothing about
 * zero-argument tools or resources. This audit instead requires every tool and
 * resource to STATE its authorization model, so "no check fired" is either
 * justified or a build failure.
 *
 * See docs/AUTHORIZATION_MODELS.md for the taxonomy.
 */

export const MODELS = Object.freeze([
  "jwt-advertiser-scoped",
  "session-bound",
  "unscoped-local",
  "exempt",
]);

const DECLARATION_RE = /authorization-model:\s*([a-z-]+)/g;
const ASSERT_RE = /\bassertAccountScope\s*\(/;
/** A `bound<Account>Id` local destructured from the session services. */
const BOUND_ACCOUNT_RE = /\bbound[A-Z][A-Za-z0-9]*(?:Id|Ids|Urn)\b/;
/** Handler resolves session services — i.e. it can execute against an account. */
const RESOLVE_SESSION_RE = /\bresolveSessionServices\s*\(/;

/**
 * Audit one file.
 *
 * @param {{ path: string, source: string }} file
 * @returns {{ path: string, code: string, detail: string } | null}
 */
export function auditAuthorizationModelFile(file) {
  const found = [...file.source.matchAll(DECLARATION_RE)].map((m) => m[1]);

  if (found.length === 0) {
    return {
      path: file.path,
      code: "missing",
      detail:
        "no `authorization-model:` declaration — add one of: " +
        MODELS.join(" | ") +
        " (see docs/AUTHORIZATION_MODELS.md)",
    };
  }

  if (found.length > 1) {
    return {
      path: file.path,
      code: "ambiguous",
      detail: `${found.length} declarations found (${found.join(", ")}) — exactly one is required`,
    };
  }

  const model = found[0];

  if (!MODELS.includes(model)) {
    return {
      path: file.path,
      code: "unknown-model",
      detail: `"${model}" is not a known model — expected one of: ${MODELS.join(" | ")}`,
    };
  }

  // ── Consistency checks: the declaration must match what the code does ──────
  //
  // A declaration nobody verifies is just a comment. These catch the two ways a
  // file can claim a weaker model than it actually needs.

  if (model === "session-bound" && !ASSERT_RE.test(file.source)) {
    return {
      path: file.path,
      code: "session-bound-without-assert",
      detail:
        "declares `session-bound` but never calls assertAccountScope() — a caller naming " +
        "another account has the call execute against the session-bound one",
    };
  }

  // The false-green that motivated this guard: a handler that resolves session
  // services executes against the session's account, whether or not it happens
  // to destructure a `bound*` local. Claiming `unscoped-local` there is wrong by
  // construction.
  if (model === "unscoped-local" && RESOLVE_SESSION_RE.test(file.source)) {
    return {
      path: file.path,
      code: "unscoped-but-resolves-session",
      detail:
        "declares `unscoped-local` but calls resolveSessionServices() — it executes against " +
        "the session-bound account and must be `session-bound`",
    };
  }

  if (model === "exempt") {
    // An exemption is only meaningful if it says what it exempts and why.
    // Require the rationale to be substantive rather than a bare marker.
    const line = exemptionContext(file.source);
    if (!line || line.length < 40) {
      return {
        path: file.path,
        code: "exempt-without-rationale",
        detail:
          "declares `exempt` without an adequate rationale — state the exact tool, the exact " +
          "field, and why no scope check applies",
      };
    }
  }

  // A file that binds an account id but declares neither session-bound nor
  // exempt has almost certainly mis-declared.
  if (
    (model === "jwt-advertiser-scoped" || model === "unscoped-local") &&
    BOUND_ACCOUNT_RE.test(file.source) &&
    !ASSERT_RE.test(file.source)
  ) {
    return {
      path: file.path,
      code: "binds-account-without-assert",
      detail:
        `declares \`${model}\` but destructures a session-bound account id without calling ` +
        "assertAccountScope() — it is `session-bound`",
    };
  }

  return null;
}

/** Text following the `authorization-model: exempt` declaration, for rationale length. */
function exemptionContext(source) {
  const idx = source.search(/authorization-model:\s*exempt/);
  if (idx === -1) return "";
  return source
    .slice(idx, idx + 600)
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Audit many files, skipping baseline entries.
 *
 * The baseline is SHRINK-ONLY: `newlyUnclassified` reports baseline additions,
 * which the runner treats as a failure. That keeps the regression path
 * fail-loud (a new file must classify itself) without requiring the whole
 * pre-existing surface to be classified in one change.
 *
 * @param {Array<{ path: string, source: string }>} files
 * @param {string[]} baseline
 */
export function auditAuthorizationModelCoverage(files, baseline = []) {
  const baselineSet = new Set(baseline);
  const seen = new Set(files.map((f) => f.path));

  const violations = [];
  const stillUnclassified = [];

  for (const file of files) {
    const violation = auditAuthorizationModelFile(file);
    if (!violation) continue;

    // Baseline only excuses a MISSING declaration. A file that declares a model
    // inconsistent with its code is a real defect and is reported regardless.
    if (violation.code === "missing" && baselineSet.has(file.path)) {
      stillUnclassified.push(file.path);
      continue;
    }
    violations.push(violation);
  }

  // Entries that no longer exist (renamed/deleted) should be pruned so the
  // baseline cannot quietly accumulate dead paths.
  const stale = baseline.filter((p) => !seen.has(p));

  return { violations, stillUnclassified, stale };
}

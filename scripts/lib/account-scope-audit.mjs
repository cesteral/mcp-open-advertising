// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Account-scope coverage audit (pure logic).
 *
 * Single-account platform servers (amazon-dsp, pinterest, tiktok, snapchat,
 * linkedin, ...) bind one ad account per session at auth time. Their tools
 * declare a REQUIRED scoping parameter in the Zod schema (`advertiserId`,
 * `profileId`, `adAccountId`, ...) but the handler ignores it and uses the
 * session-bound account instead. Without `assertAccountScope(input.x, boundX,
 * "x")`, a caller that names account B while the session is bound to account A
 * has its call — including writes — silently execute against A. That is a
 * wrong-account execution the schema actively lies about (see
 * `packages/shared/src/utils/assert-account-scope.ts`).
 *
 * `assertAccountScope` is opt-in per handler, so a new tool can forget it and
 * reintroduce the silent mismatch. This audit is the regression guard: a tool
 * that reads a session-bound account id MUST also call `assertAccountScope`.
 *
 * Discriminator — the presence of a `bound<Account>Id` local (destructured
 * from `resolveSessionServices`) is what means "this handler uses the
 * session-bound account". A tool that instead passes an input id straight to
 * the API (no `bound*` local) is scoped by the input itself and needs no
 * assertion, so it is not flagged. This keeps the check free of the false
 * positives a naive "declares a scope param" rule would produce.
 *
 * Escape hatch: a file containing the marker `account-scope-audit-exempt`
 * (in a comment, with justification) is skipped — for a tool that legitimately
 * reads a bound account id without a caller-supplied scope param to check.
 */

/**
 * Matches a session-bound account identifier local, e.g. `boundAdAccountId`,
 * `boundProfileId`, `boundAdvertiserId`, `boundCustomerId`, `boundAdAccountUrn`.
 * Requires a capital immediately after `bound` (so the English word "bounded"
 * does not match) and an `Id`/`Ids`/`Urn` suffix (so only account-shaped names
 * match).
 */
export const BOUND_ACCOUNT_RE = /\bbound[A-Z][A-Za-z0-9]*(?:Id|Ids|Urn)\b/g;
const ASSERT_RE = /\bassertAccountScope\s*\(/;
const EXEMPT_RE = /account-scope-audit-exempt/;

/**
 * Audit a single tool source file.
 * @param {{ path: string, source: string }} file
 * @returns {{ path: string, boundVars: string[] } | null} violation, or null when covered.
 */
export function auditAccountScopeFile(file) {
  const bound = [...file.source.matchAll(BOUND_ACCOUNT_RE)].map((m) => m[0]);
  if (bound.length === 0) return null; // input-scoped tool — no bound account used
  if (EXEMPT_RE.test(file.source)) return null; // explicitly exempted
  if (ASSERT_RE.test(file.source)) return null; // properly asserts
  return { path: file.path, boundVars: [...new Set(bound)] };
}

/**
 * Audit many tool source files.
 * @param {Array<{ path: string, source: string }>} files
 * @returns {Array<{ path: string, boundVars: string[] }>} violations (empty when all covered).
 */
export function auditAccountScopeCoverage(files) {
  return files.map((f) => auditAccountScopeFile(f)).filter((v) => v !== null);
}

// ─────────────────────────────────────────────────────────────────────────────
// Session-contract rule (#211 Gap 1)
//
// The rule above keys on a `bound<Account>Id` LOCAL in the handler. That is
// sound when present, but a handler can execute against the session's account
// without ever destructuring one — the binding lives in the resolved SERVICE.
// `auditAccountScopeFile` then sees no `bound*`, concludes "input-scoped", and
// returns null. That is how the two Amazon commitment tools reached production
// with a REQUIRED `profileId` the handler ignored (fixed by hand in #195); the
// class stayed undetectable until this rule.
//
// This rule keys on the PACKAGE'S SESSION CONTRACT instead: if `SessionServices`
// declares a bound account id, every tool in that package that also lets the
// caller name that account must reconcile the two. A handler cannot opt out by
// declining to destructure.
//
// Deliberately NOT a dataflow analysis. Whether the caller's id is forwarded
// upstream or silently dropped is not statically decidable in this codebase —
// it reaches service calls through intermediate objects (`const filters = {...}`)
// and nested clients (`service.client.post(...)`). Requiring an explicit
// assert-or-exempt sidesteps that question and fails loud rather than open.
// ─────────────────────────────────────────────────────────────────────────────

/** A handler that resolves session services can execute against the bound account. */
const RESOLVES_SESSION_RE = /\bresolveSessionServices\s*\(/;

/**
 * The caller-supplied scope keys a package's session binds, read from its
 * `SessionServices` interface: `boundProfileId` → `profileId`.
 *
 * @param {string} source contents of `src/services/session-services.ts`
 * @returns {string[] | null} keys, or `null` when the interface cannot be found
 *   — the caller MUST treat null as an error rather than "no binding", or a
 *   rename silently disables this rule.
 */
export function extractSessionBoundKeys(source) {
  const block = source.match(/export interface SessionServices\s*\{([\s\S]*?)\n\}/);
  if (!block) return null;
  return [
    ...new Set(
      [...block[1].matchAll(/\bbound([A-Z][A-Za-z0-9]*(?:Id|Ids|Urn))\b\s*[?:]/g)].map(
        (m) => m[1][0].toLowerCase() + m[1].slice(1)
      )
    ),
  ];
}

/**
 * Audit one tool file against its package's session binding.
 *
 * @param {{ path: string, source: string, boundKeys: string[] }} file
 * @returns {{ path: string, keys: string[] } | null}
 */
export function auditSessionBoundScopeFile({ path, source, boundKeys }) {
  if (!boundKeys?.length) return null;

  // Declared in the Zod input schema. Matching the declaration (`key: z.`)
  // rather than any mention avoids counting examples, annotations and argMaps.
  const declared = boundKeys.filter((k) => new RegExp(`\\b${k}\\s*:\\s*z\\s*\\.`).test(source));
  if (!declared.length) return null;

  // A tool that never resolves session services cannot execute against the
  // bound account at all — symbolic validators and pure projections. Excluding
  // them needs no dataflow, only the absence of the call.
  if (!RESOLVES_SESSION_RE.test(source)) return null;

  if (ASSERT_RE.test(source) || EXEMPT_RE.test(source)) return null;
  return { path, keys: declared };
}

/**
 * @param {Array<{ path: string, source: string, boundKeys: string[] }>} files
 * @returns {Array<{ path: string, keys: string[] }>}
 */
export function auditSessionBoundScopeCoverage(files) {
  return files.map((f) => auditSessionBoundScopeFile(f)).filter((v) => v !== null);
}

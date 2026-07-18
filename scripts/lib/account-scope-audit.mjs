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

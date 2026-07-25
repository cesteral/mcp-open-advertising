// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Decision-token enforcement mode for a governed write tool.
 *
 * - `off` — verification skipped entirely (read-only behavior preserved). The
 *   global default, so unconfigured servers behave exactly as before.
 * - `warn` — verify and log the verdict, but never block the write.
 * - `enforce` — reject any write whose token does not verify.
 */
export type TokenMode = "off" | "warn" | "enforce";

const MODES: readonly TokenMode[] = ["off", "warn", "enforce"];

function asMode(value: string | undefined): TokenMode | undefined {
  return value && (MODES as readonly string[]).includes(value) ? (value as TokenMode) : undefined;
}

function listIncludes(raw: string | undefined, contractId: string): boolean {
  if (!raw) return false;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(contractId);
}

/** Platform slug component of a contractId (`<slug>.<tool>.v<n>` → `<slug>`). */
function platformSlugOf(contractId: string): string {
  return contractId.split(".")[0] ?? "";
}

/**
 * Resolve the enforcement mode for a single contract using a three-tier
 * precedence so a 122-tool rollout can be staged without an all-or-nothing flip:
 *
 *   per-contract override  >  per-server  >  global  >  off
 *
 * Env vars:
 * - `GOVERNANCE_TOKEN_MODE` — global base (`off` | `warn` | `enforce`).
 * - `GOVERNANCE_TOKEN_MODE_<SLUG>` — per-server override, where `<SLUG>` is the
 *   contractId platform slug upper-cased (e.g. `GOVERNANCE_TOKEN_MODE_META`).
 * - `GOVERNANCE_TOKEN_MODE_ENFORCE_CONTRACTS` / `_WARN_CONTRACTS` /
 *   `_OFF_CONTRACTS` — comma-separated contractId lists, highest precedence.
 *
 * Invalid mode strings are ignored (fall through to the next tier), so a typo
 * falls through to the tier default rather than silently enforcing.
 *
 * **Tier 3 default is `warn` on a hosted deployment** (`K_SERVICE` set) and
 * `off` otherwise. It was unconditionally `off`, which meant a
 * default-deployed server ran every governed write with no token verification
 * at all while its manifest advertised the tools as governed (sweep
 * 2026-07-25, 05-F2). `warn` is non-breaking — only `enforce` rejects, so a
 * caller with no token still succeeds — but it runs the full verification and
 * logs a per-call verdict, turning an invisible fail-open into a visible one.
 * Staged rollout is unaffected: every explicit tier, including
 * `GOVERNANCE_TOKEN_MODE=off`, still wins.
 *
 * Not defaulted to `enforce` on purpose. `enforce` rejects any write without a
 * valid token, so making it the default would break every deployment that has
 * not yet wired the governance layer — a posture that has to be chosen, not
 * inherited.
 *
 * Within Tier 1 the lists are checked STRICTEST-FIRST (enforce > warn > off).
 * If a contractId is mistakenly placed in more than one list, the stricter mode
 * wins — a contradiction on a money-moving gate must never resolve toward
 * disabling verification. (Checking `off` first would let a stray debugging
 * entry silently un-govern a contract that a rollout had just moved to
 * `enforce`.)
 */
export function resolveTokenMode(opts: {
  contractId: string;
  env: Record<string, string | undefined>;
}): TokenMode {
  const { contractId, env } = opts;

  // Tier 1 — explicit per-contract lists (highest precedence), strictest-first
  // so a contractId listed in multiple lists resolves to the safer mode.
  if (listIncludes(env.GOVERNANCE_TOKEN_MODE_ENFORCE_CONTRACTS, contractId)) return "enforce";
  if (listIncludes(env.GOVERNANCE_TOKEN_MODE_WARN_CONTRACTS, contractId)) return "warn";
  if (listIncludes(env.GOVERNANCE_TOKEN_MODE_OFF_CONTRACTS, contractId)) return "off";

  // Tier 2 — per-server override keyed by platform slug.
  const slug = platformSlugOf(contractId).toUpperCase();
  const perServer = asMode(env[`GOVERNANCE_TOKEN_MODE_${slug}`]);
  if (perServer) return perServer;

  // Tier 3 — global base. Defaults to `warn` on a hosted deployment so an
  // unconfigured server is at least verifying and reporting, `off` on
  // stdio/self-host where there is no governance layer to mint tokens.
  const global = asMode(env.GOVERNANCE_TOKEN_MODE);
  if (global) return global;
  return env.K_SERVICE ? "warn" : "off";
}

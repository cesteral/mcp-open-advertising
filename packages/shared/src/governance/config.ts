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
 * fails safe toward `off` rather than silently enforcing.
 */
export function resolveTokenMode(opts: {
  contractId: string;
  env: Record<string, string | undefined>;
}): TokenMode {
  const { contractId, env } = opts;

  // Tier 1 — explicit per-contract lists (highest precedence).
  if (listIncludes(env.GOVERNANCE_TOKEN_MODE_OFF_CONTRACTS, contractId)) return "off";
  if (listIncludes(env.GOVERNANCE_TOKEN_MODE_ENFORCE_CONTRACTS, contractId)) return "enforce";
  if (listIncludes(env.GOVERNANCE_TOKEN_MODE_WARN_CONTRACTS, contractId)) return "warn";

  // Tier 2 — per-server override keyed by platform slug.
  const slug = platformSlugOf(contractId).toUpperCase();
  const perServer = asMode(env[`GOVERNANCE_TOKEN_MODE_${slug}`]);
  if (perServer) return perServer;

  // Tier 3 — global base, defaulting to off.
  return asMode(env.GOVERNANCE_TOKEN_MODE) ?? "off";
}

// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import * as jose from "jose";
import type { JtiStore } from "./jti-store.js";

const ISSUER = "cesteral-intelligence";
const AUDIENCE = "mcp-open-advertising";
const DEFAULT_CLOCK_TOLERANCE_SEC = 30;

/** Claims that MUST be present and well-typed before any binding check or jti consume. */
const REQUIRED_CLAIMS = [
  "jti",
  "exp",
  "iat",
  "sub",
  "contractId",
  "definitionHash",
  "actionHash",
] as const;

const STRING_CLAIMS = ["jti", "sub", "contractId", "definitionHash", "actionHash"] as const;
const NUMBER_CLAIMS = ["exp", "iat"] as const;

/** Distinct outcome of decision-token verification. `ok` iff `reasonCode === "OK"`. */
export type DecisionTokenReason =
  | "OK"
  | "MISSING_TOKEN"
  | "MALFORMED_TOKEN"
  | "UNSUPPORTED_ALG"
  | "SECRET_UNCONFIGURED"
  | "INVALID_SIGNATURE"
  | "MISSING_CLAIM"
  | "EXPIRED"
  | "WRONG_ISSUER"
  | "WRONG_AUDIENCE"
  | "CONTRACT_MISMATCH"
  | "DEFINITION_HASH_MISMATCH"
  | "ACTION_HASH_MISMATCH"
  | "REPLAYED_JTI"
  | "JTI_STORE_ERROR";

export interface DecisionTokenVerdict {
  ok: boolean;
  reasonCode: DecisionTokenReason;
  /** Safe-to-log extra context, e.g. the missing/malformed claim name. */
  detail?: string;
  /**
   * Whether the definition-hash binding was actually checked. `false` when the
   * caller could not supply the expected hash (no manifest resolver) — every
   * OTHER binding still ran. Audited so a warn-mode rollout surfaces the gap.
   */
  definitionHashVerified: boolean;
  /** Claims surfaced for audit (never the raw token). */
  claims?: { sub?: string; contractId?: string; jti?: string; approvalId?: string };
}

export interface VerifyDecisionTokenOptions {
  token: string | undefined;
  /**
   * HS256 secrets. When the token header carries a `kid`, ONLY the matching
   * secret is tried (no fallback). Without a `kid`, `current` then `previous`.
   */
  secrets: { current: string; previous?: string };
  /**
   * Expected bindings. `definitionHash` is optional: when undefined (no manifest
   * resolver), the definition-hash check is skipped while every other binding
   * still runs, and the verdict reports `definitionHashVerified: false`.
   */
  expected: { contractId: string; definitionHash?: string; actionHash: string };
  jtiStore: JtiStore;
  jtiTtlMs: number;
  clockToleranceSec?: number;
  now?: () => number;
}

function verdict(
  reasonCode: DecisionTokenReason,
  opts: { claims?: Record<string, unknown>; detail?: string; definitionHashVerified?: boolean } = {}
): DecisionTokenVerdict {
  const v: DecisionTokenVerdict = {
    ok: reasonCode === "OK",
    reasonCode,
    definitionHashVerified: opts.definitionHashVerified ?? false,
  };
  if (opts.detail !== undefined) v.detail = opts.detail;
  if (opts.claims) {
    const c = opts.claims;
    v.claims = {
      sub: typeof c.sub === "string" ? c.sub : undefined,
      contractId: typeof c.contractId === "string" ? c.contractId : undefined,
      jti: typeof c.jti === "string" ? c.jti : undefined,
      approvalId: typeof c.approvalId === "string" ? c.approvalId : undefined,
    };
  }
  return v;
}

/**
 * Candidate secrets to try, in order. Empty/whitespace secrets are filtered
 * out so a missing `GOVERNANCE_DECISION_TOKEN_SECRET` can never become an
 * empty-string HS256 key that a forged token could sign against. When a `kid`
 * is present, only that secret is eligible (no fallback).
 */
function selectSecrets(kid: unknown, secrets: { current: string; previous?: string }): string[] {
  const current = secrets.current?.trim() ? secrets.current : undefined;
  const previous = secrets.previous?.trim() ? secrets.previous : undefined;
  if (typeof kid === "string" && kid.length > 0) {
    if (kid === "current" && current) return [current];
    if (kid === "previous" && previous) return [previous];
    return []; // unknown kid, or its secret unconfigured → no candidate
  }
  return [current, previous].filter((s): s is string => s !== undefined);
}

/**
 * Verify an Intelligence-minted `X-Cesteral-Decision-Token` and bind it to the
 * actual write. Never throws — returns a {@link DecisionTokenVerdict}; the
 * caller decides warn vs enforce. Checks run in a fixed order so each failure
 * mode has a distinct reason code, and **`jtiStore.consumeOnce` is the LAST
 * step** — a malformed / mismatched / unauthorized token never burns a
 * legitimate `jti`.
 */
export async function verifyDecisionToken(
  opts: VerifyDecisionTokenOptions
): Promise<DecisionTokenVerdict> {
  const { token, secrets, expected, jtiStore, jtiTtlMs } = opts;
  const tolerance = opts.clockToleranceSec ?? DEFAULT_CLOCK_TOLERANCE_SEC;
  const definitionHashVerified = expected.definitionHash !== undefined;
  const enc = new TextEncoder();

  if (!token) return verdict("MISSING_TOKEN", { definitionHashVerified });

  if (token.split(".").length !== 3) return verdict("MALFORMED_TOKEN", { definitionHashVerified });

  // Header: alg allowlist (HS256 only) before any signature work.
  let header: jose.ProtectedHeaderParameters;
  try {
    header = jose.decodeProtectedHeader(token);
  } catch {
    return verdict("MALFORMED_TOKEN", { definitionHashVerified });
  }
  if (header.alg !== "HS256") return verdict("UNSUPPORTED_ALG", { definitionHashVerified });

  // Signature: verify (only) against the kid-selected secret(s). compactVerify
  // checks the signature WITHOUT validating claims, so we own claim ordering.
  const candidates = selectSecrets(header.kid, secrets);
  // No configured secret at all (vs. a wrong/unknown one) → fail closed with a
  // distinct reason so an unset GOVERNANCE_DECISION_TOKEN_SECRET is diagnosable
  // and can never become an empty-string signing key.
  if (selectSecrets(undefined, secrets).length === 0) {
    return verdict("SECRET_UNCONFIGURED", { definitionHashVerified });
  }
  let payloadBytes: Uint8Array | undefined;
  for (const secret of candidates) {
    try {
      const result = await jose.compactVerify(token, enc.encode(secret));
      payloadBytes = result.payload;
      break;
    } catch {
      // try next candidate
    }
  }
  if (!payloadBytes) return verdict("INVALID_SIGNATURE", { definitionHashVerified });

  let claims: Record<string, unknown>;
  try {
    claims = JSON.parse(new TextDecoder().decode(payloadBytes)) as Record<string, unknown>;
  } catch {
    return verdict("MALFORMED_TOKEN", { definitionHashVerified });
  }

  // Required-claim presence, then type.
  for (const c of REQUIRED_CLAIMS) {
    if (claims[c] === undefined || claims[c] === null) {
      return verdict("MISSING_CLAIM", { claims, detail: c, definitionHashVerified });
    }
  }
  for (const c of STRING_CLAIMS) {
    if (typeof claims[c] !== "string" || (claims[c] as string).length === 0) {
      return verdict("MALFORMED_TOKEN", { claims, detail: c, definitionHashVerified });
    }
  }
  for (const c of NUMBER_CLAIMS) {
    if (typeof claims[c] !== "number" || !Number.isFinite(claims[c] as number)) {
      return verdict("MALFORMED_TOKEN", { claims, detail: c, definitionHashVerified });
    }
  }

  // Expiry (own check, with tolerance — also covers the missing-exp case above).
  const nowMs = opts.now?.() ?? Date.now();
  if (nowMs / 1000 > (claims.exp as number) + tolerance) {
    return verdict("EXPIRED", { claims, definitionHashVerified });
  }

  // Issuer / audience.
  if (claims.iss !== ISSUER) return verdict("WRONG_ISSUER", { claims, definitionHashVerified });
  const aud = claims.aud;
  const audOk = aud === AUDIENCE || (Array.isArray(aud) && aud.includes(AUDIENCE));
  if (!audOk) return verdict("WRONG_AUDIENCE", { claims, definitionHashVerified });

  // Bind the token to the actual write.
  if (claims.contractId !== expected.contractId) {
    return verdict("CONTRACT_MISMATCH", { claims, definitionHashVerified });
  }
  // Definition-hash binding is skipped only when the caller could not resolve
  // the expected hash; every other binding still runs.
  if (expected.definitionHash !== undefined && claims.definitionHash !== expected.definitionHash) {
    return verdict("DEFINITION_HASH_MISMATCH", { claims, definitionHashVerified });
  }
  if (claims.actionHash !== expected.actionHash) {
    return verdict("ACTION_HASH_MISMATCH", { claims, definitionHashVerified });
  }

  // Replay protection — LAST, only on an otherwise-valid token. Consume for at
  // least the token's remaining lifetime so a short jtiTtlMs cannot let an
  // un-expired token replay after the store entry lapses.
  const tokenRemainingMs = ((claims.exp as number) + tolerance) * 1000 - nowMs;
  const consumeTtlMs = Math.max(jtiTtlMs, tokenRemainingMs);
  let consumed: "fresh" | "replayed";
  try {
    consumed = await jtiStore.consumeOnce(claims.jti as string, consumeTtlMs);
  } catch (err) {
    // The jti store is unreachable (e.g. FirestoreJtiStore propagating an
    // UNAVAILABLE / PERMISSION_DENIED). This function's contract is that it
    // NEVER throws — surface the failure as a distinct verdict so the caller's
    // mode logic still applies: `warn` logs + proceeds (never blocks a
    // legitimate write on a transient store outage), `enforce` blocks (fails
    // closed — replay protection could not be established). Letting the error
    // escape would silently turn warn-mode verification into a hard block with
    // no decision-token audit record or metric.
    return verdict("JTI_STORE_ERROR", {
      claims,
      detail: err instanceof Error ? err.message : undefined,
      definitionHashVerified,
    });
  }
  if (consumed === "replayed") return verdict("REPLAYED_JTI", { claims, definitionHashVerified });

  return verdict("OK", { claims, definitionHashVerified });
}

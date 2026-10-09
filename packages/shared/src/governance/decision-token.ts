// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import * as jose from "jose";
import {
  DEFAULT_HASH_ALG,
  hashActionInput,
  hasOrderSensitiveKeys,
  isHashAlg,
  type HashAlg,
} from "@cesteral/contract-hash";
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
  | "UNSUPPORTED_HASH_ALG"
  | "SECRET_UNCONFIGURED"
  | "INVALID_SIGNATURE"
  | "MISSING_CLAIM"
  | "EXPIRED"
  | "WRONG_ISSUER"
  | "WRONG_AUDIENCE"
  | "CONTRACT_MISMATCH"
  | "HASH_ALG_MISMATCH"
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
  /**
   * The hash algorithm the token's SIGNED `hashAlg` claim selected (absent claim =
   * `cesteral-c14n-v1`). Undefined when the verdict was reached before the claim
   * was read (no token, bad signature, ...) or when the claim itself was rejected.
   */
  hashAlg?: HashAlg;
  /**
   * Whether the executable args contain an object whose key order depends on the
   * algorithm (see `hasOrderSensitiveKeys`). Reported on EVERY verdict, including
   * rejections, so warn-mode traffic measures how often the choice of algorithm
   * could change an `actionHash` before anything is switched.
   */
  orderSensitiveArgs: boolean;
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
   * Expected bindings.
   *
   * `executableArgs` is the canonicalized executable write args (the output of
   * `canonicalizeExecutableArgs`), NOT a hash of them. The verifier hashes them
   * itself, under the algorithm the SIGNED token names — a hash computed by the
   * caller before the token was opened could only ever be one algorithm.
   *
   * `definitionHash` is optional: when undefined (no manifest resolver), the
   * definition-hash check is skipped while every other binding still runs, and the
   * verdict reports `definitionHashVerified: false`. When present,
   * `definitionHashAlg` is the algorithm that manifest entry's hash was computed
   * under (absent = `cesteral-c14n-v1`) and MUST equal the token's, otherwise the
   * verdict is `HASH_ALG_MISMATCH` — hashes are never compared across algorithms.
   */
  expected: {
    contractId: string;
    definitionHash?: string;
    definitionHashAlg?: HashAlg;
    executableArgs: unknown;
  };
  jtiStore: JtiStore;
  jtiTtlMs: number;
  clockToleranceSec?: number;
  now?: () => number;
}

function verdict(
  reasonCode: DecisionTokenReason,
  opts: {
    claims?: Record<string, unknown>;
    detail?: string;
    definitionHashVerified?: boolean;
    hashAlg?: HashAlg;
    orderSensitiveArgs?: boolean;
  } = {}
): DecisionTokenVerdict {
  const v: DecisionTokenVerdict = {
    ok: reasonCode === "OK",
    reasonCode,
    definitionHashVerified: opts.definitionHashVerified ?? false,
    orderSensitiveArgs: opts.orderSensitiveArgs ?? false,
  };
  if (opts.detail !== undefined) v.detail = opts.detail;
  if (opts.hashAlg !== undefined) v.hashAlg = opts.hashAlg;
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
 *
 * The order that matters for `hashAlg`: signature first, then the signed
 * `hashAlg` claim is read (absent = `cesteral-c14n-v1`; a non-string is
 * `MALFORMED_TOKEN`; an unknown name is `UNSUPPORTED_HASH_ALG`), and only then are
 * the bindings checked. Exactly ONE algorithm is in force for the whole call: it
 * hashes the executable args, and it must equal the manifest entry's algorithm
 * before the definition hashes are compared. The JWT header is never consulted.
 */
export async function verifyDecisionToken(
  opts: VerifyDecisionTokenOptions
): Promise<DecisionTokenVerdict> {
  const { token, secrets, expected, jtiStore, jtiTtlMs } = opts;
  const tolerance = opts.clockToleranceSec ?? DEFAULT_CLOCK_TOLERANCE_SEC;
  const definitionHashVerified = expected.definitionHash !== undefined;
  const orderSensitiveArgs = hasOrderSensitiveKeys(expected.executableArgs);
  const enc = new TextEncoder();

  // Set once the signed claim has been read; every later verdict carries it.
  let hashAlg: HashAlg | undefined;
  const out = (
    reasonCode: DecisionTokenReason,
    o: { claims?: Record<string, unknown>; detail?: string } = {}
  ): DecisionTokenVerdict =>
    verdict(reasonCode, { ...o, definitionHashVerified, orderSensitiveArgs, hashAlg });

  if (!token) return out("MISSING_TOKEN");

  if (token.split(".").length !== 3) return out("MALFORMED_TOKEN");

  // Header: alg allowlist (HS256 only) before any signature work.
  let header: jose.ProtectedHeaderParameters;
  try {
    header = jose.decodeProtectedHeader(token);
  } catch {
    return out("MALFORMED_TOKEN");
  }
  if (header.alg !== "HS256") return out("UNSUPPORTED_ALG");

  // Signature: verify (only) against the kid-selected secret(s). compactVerify
  // checks the signature WITHOUT validating claims, so we own claim ordering.
  const candidates = selectSecrets(header.kid, secrets);
  // No configured secret at all (vs. a wrong/unknown one) → fail closed with a
  // distinct reason so an unset GOVERNANCE_DECISION_TOKEN_SECRET is diagnosable
  // and can never become an empty-string signing key.
  if (selectSecrets(undefined, secrets).length === 0) {
    return out("SECRET_UNCONFIGURED");
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
  if (!payloadBytes) return out("INVALID_SIGNATURE");

  let claims: Record<string, unknown>;
  try {
    claims = JSON.parse(new TextDecoder().decode(payloadBytes)) as Record<string, unknown>;
  } catch {
    return out("MALFORMED_TOKEN");
  }

  // Required-claim presence, then type.
  for (const c of REQUIRED_CLAIMS) {
    if (claims[c] === undefined || claims[c] === null) {
      return out("MISSING_CLAIM", { claims, detail: c });
    }
  }
  for (const c of STRING_CLAIMS) {
    if (typeof claims[c] !== "string" || (claims[c] as string).length === 0) {
      return out("MALFORMED_TOKEN", { claims, detail: c });
    }
  }
  for (const c of NUMBER_CLAIMS) {
    if (typeof claims[c] !== "number" || !Number.isFinite(claims[c] as number)) {
      return out("MALFORMED_TOKEN", { claims, detail: c });
    }
  }

  // The hash algorithm, from the SIGNED payload. Absent means the original
  // canonicalization (every token minted before this claim existed); present-but-
  // not-a-string (including null) is malformed, never "absent"; an unknown name
  // fails closed. Read before expiry/issuer/bindings so every later check runs
  // under exactly one algorithm, and before any jti is consumed.
  if (claims.hashAlg === undefined) {
    hashAlg = DEFAULT_HASH_ALG;
  } else if (typeof claims.hashAlg !== "string") {
    return out("MALFORMED_TOKEN", { claims, detail: "hashAlg" });
  } else if (!isHashAlg(claims.hashAlg)) {
    return out("UNSUPPORTED_HASH_ALG", { claims, detail: claims.hashAlg.slice(0, 64) });
  } else {
    hashAlg = claims.hashAlg;
  }

  // Expiry (own check, with tolerance — also covers the missing-exp case above).
  const nowMs = opts.now?.() ?? Date.now();
  if (nowMs / 1000 > (claims.exp as number) + tolerance) {
    return out("EXPIRED", { claims });
  }

  // Issuer / audience.
  if (claims.iss !== ISSUER) return out("WRONG_ISSUER", { claims });
  const aud = claims.aud;
  const audOk = aud === AUDIENCE || (Array.isArray(aud) && aud.includes(AUDIENCE));
  if (!audOk) return out("WRONG_AUDIENCE", { claims });

  // Bind the token to the actual write.
  if (claims.contractId !== expected.contractId) {
    return out("CONTRACT_MISMATCH", { claims });
  }
  // Definition-hash binding is skipped only when the caller could not resolve
  // the expected hash; every other binding still runs. When it does run, the
  // token and the manifest entry must name the SAME algorithm first: comparing a
  // hash computed one way against one computed another can only mismatch or,
  // worse, coincide, and either way says nothing about the definition.
  if (expected.definitionHash !== undefined) {
    const entryAlg = expected.definitionHashAlg ?? DEFAULT_HASH_ALG;
    if (hashAlg !== entryAlg) {
      return out("HASH_ALG_MISMATCH", { claims, detail: `token=${hashAlg} manifest=${entryAlg}` });
    }
    if (claims.definitionHash !== expected.definitionHash) {
      return out("DEFINITION_HASH_MISMATCH", { claims });
    }
  }
  // The args are hashed HERE, under the signed algorithm. They can fail to
  // canonicalize (a lone surrogate sent as a JSON \ud800 escape is legal JSON but
  // not valid I-JSON); the minter could not have hashed them either, so that is a
  // mismatch — and this function's contract is that it never throws.
  let expectedActionHash: string;
  try {
    expectedActionHash = hashActionInput(expected.executableArgs, hashAlg);
  } catch {
    return out("ACTION_HASH_MISMATCH", {
      claims,
      detail: `arguments cannot be canonicalized under ${hashAlg}`,
    });
  }
  if (claims.actionHash !== expectedActionHash) {
    return out("ACTION_HASH_MISMATCH", { claims });
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
    return out("JTI_STORE_ERROR", {
      claims,
      detail: err instanceof Error ? err.message : undefined,
    });
  }
  if (consumed === "replayed") return out("REPLAYED_JTI", { claims });

  return out("OK", { claims });
}

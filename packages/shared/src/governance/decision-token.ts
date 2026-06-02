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
  | "INVALID_SIGNATURE"
  | "MISSING_CLAIM"
  | "EXPIRED"
  | "WRONG_ISSUER"
  | "WRONG_AUDIENCE"
  | "CONTRACT_MISMATCH"
  | "DEFINITION_HASH_MISMATCH"
  | "ACTION_HASH_MISMATCH"
  | "REPLAYED_JTI";

export interface DecisionTokenVerdict {
  ok: boolean;
  reasonCode: DecisionTokenReason;
  /** Safe-to-log extra context, e.g. the missing/malformed claim name. */
  detail?: string;
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
  expected: { contractId: string; definitionHash: string; actionHash: string };
  jtiStore: JtiStore;
  jtiTtlMs: number;
  clockToleranceSec?: number;
  now?: () => number;
}

function verdict(
  reasonCode: DecisionTokenReason,
  claims?: Record<string, unknown>,
  detail?: string
): DecisionTokenVerdict {
  const v: DecisionTokenVerdict = { ok: reasonCode === "OK", reasonCode };
  if (detail !== undefined) v.detail = detail;
  if (claims) {
    v.claims = {
      sub: typeof claims.sub === "string" ? claims.sub : undefined,
      contractId: typeof claims.contractId === "string" ? claims.contractId : undefined,
      jti: typeof claims.jti === "string" ? claims.jti : undefined,
      approvalId: typeof claims.approvalId === "string" ? claims.approvalId : undefined,
    };
  }
  return v;
}

function selectSecrets(kid: unknown, secrets: { current: string; previous?: string }): string[] {
  if (typeof kid === "string" && kid.length > 0) {
    if (kid === "current") return [secrets.current];
    if (kid === "previous" && secrets.previous) return [secrets.previous];
    return []; // unknown kid → no candidate secret → INVALID_SIGNATURE
  }
  return secrets.previous ? [secrets.current, secrets.previous] : [secrets.current];
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
  const enc = new TextEncoder();

  if (!token) return verdict("MISSING_TOKEN");

  if (token.split(".").length !== 3) return verdict("MALFORMED_TOKEN");

  // Header: alg allowlist (HS256 only) before any signature work.
  let header: jose.ProtectedHeaderParameters;
  try {
    header = jose.decodeProtectedHeader(token);
  } catch {
    return verdict("MALFORMED_TOKEN");
  }
  if (header.alg !== "HS256") return verdict("UNSUPPORTED_ALG");

  // Signature: verify (only) against the kid-selected secret(s). compactVerify
  // checks the signature WITHOUT validating claims, so we own claim ordering.
  const candidates = selectSecrets(header.kid, secrets);
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
  if (!payloadBytes) return verdict("INVALID_SIGNATURE");

  let claims: Record<string, unknown>;
  try {
    claims = JSON.parse(new TextDecoder().decode(payloadBytes)) as Record<string, unknown>;
  } catch {
    return verdict("MALFORMED_TOKEN");
  }

  // Required-claim presence, then type.
  for (const c of REQUIRED_CLAIMS) {
    if (claims[c] === undefined || claims[c] === null) return verdict("MISSING_CLAIM", claims, c);
  }
  for (const c of STRING_CLAIMS) {
    if (typeof claims[c] !== "string" || (claims[c] as string).length === 0) {
      return verdict("MALFORMED_TOKEN", claims, c);
    }
  }
  for (const c of NUMBER_CLAIMS) {
    if (typeof claims[c] !== "number" || !Number.isFinite(claims[c] as number)) {
      return verdict("MALFORMED_TOKEN", claims, c);
    }
  }

  // Expiry (own check, with tolerance — also covers the missing-exp case above).
  const nowSec = (opts.now?.() ?? Date.now()) / 1000;
  if (nowSec > (claims.exp as number) + tolerance) return verdict("EXPIRED", claims);

  // Issuer / audience.
  if (claims.iss !== ISSUER) return verdict("WRONG_ISSUER", claims);
  const aud = claims.aud;
  const audOk = aud === AUDIENCE || (Array.isArray(aud) && aud.includes(AUDIENCE));
  if (!audOk) return verdict("WRONG_AUDIENCE", claims);

  // Bind the token to the actual write.
  if (claims.contractId !== expected.contractId) return verdict("CONTRACT_MISMATCH", claims);
  if (claims.definitionHash !== expected.definitionHash) {
    return verdict("DEFINITION_HASH_MISMATCH", claims);
  }
  if (claims.actionHash !== expected.actionHash) return verdict("ACTION_HASH_MISMATCH", claims);

  // Replay protection — LAST, only on an otherwise-valid token.
  const consumed = await jtiStore.consumeOnce(claims.jti as string, jtiTtlMs);
  if (consumed === "replayed") return verdict("REPLAYED_JTI", claims);

  return verdict("OK", claims);
}

// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { createHash } from "node:crypto";

/**
 * Subset of an MCP tool definition that participates in the canonical
 * governance hash. Only governance-relevant fields are included; non-
 * governance metadata (title, _meta, execution, etc.) is intentionally
 * excluded.
 */
export interface HashableToolDefinition {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
}

const GOVERNANCE_FIELDS = [
  "name",
  "description",
  "inputSchema",
  "outputSchema",
  "annotations",
] as const;

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      // Use defineProperty, NOT `sorted[key] = …`. A plain assignment for the key
      // `"__proto__"` invokes `Object.prototype`'s `__proto__` setter, which sets
      // the object's prototype instead of creating an own property — so the key is
      // silently DROPPED and `JSON.stringify` omits it. That let an attacker add an
      // own nested `__proto__` property to a hashed object and keep the SAME
      // `definitionHash` as the property-free definition — a deterministic collision
      // that carried a semantically-mutated tool to a blessed hash and `attested`
      // trust (2026-07-19 follow-up review, C1). Defining an own enumerable data
      // property makes every key — `__proto__` included — part of the canonical
      // bytes. `__proto__`-free values serialize identically to before, so existing
      // blessed hashes and golden vectors are unchanged.
      Object.defineProperty(sorted, key, {
        value: sortKeysDeep((value as Record<string, unknown>)[key]),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    return sorted;
  }
  return value;
}

/**
 * Canonical JSON string: deep key-sorted, JSON-compatible ONLY.
 *
 * Throws on BigInt / Date / NaN / Infinity / function / symbol / class instance
 * and on root `undefined`, rather than silently coercing — Zod output may not be
 * JSON, and a silent coercion would diverge from `cesteral-intelligence`'s
 * `stableStringify` (lib/features/governance/utils.ts). For valid wire JSON the
 * byte output is identical to that implementation (both deep-sort keys and use
 * JSON.stringify for keys/primitives with no whitespace).
 *
 * Undefined object properties are DROPPED (JSON semantics); undefined array
 * elements are REJECTED (JSON.stringify would coerce them to null).
 */
export function stableStringify(value: unknown): string {
  if (typeof value === "undefined") {
    throw new Error("stableStringify: undefined is not valid JSON at the root");
  }
  return JSON.stringify(sortKeysDeep(assertJsonCompatible(value)));
}

function assertJsonCompatible(value: unknown): unknown {
  const t = typeof value;
  if (t === "bigint") throw new Error("stableStringify: BigInt is not JSON-serializable");
  if (t === "function") throw new Error("stableStringify: function is not JSON-serializable");
  if (t === "symbol") throw new Error("stableStringify: symbol is not JSON-serializable");
  if (t === "number" && !Number.isFinite(value as number))
    throw new Error("stableStringify: NaN/Infinity are not valid JSON");
  if (value !== null && t === "object") {
    if (value instanceof Date) throw new Error("stableStringify: Date is not JSON-serializable");
    const proto = Object.getPrototypeOf(value);
    if (!Array.isArray(value) && proto !== Object.prototype && proto !== null)
      throw new Error("stableStringify: class instance is not JSON-serializable");
    if (Array.isArray(value)) {
      value.forEach((el) => {
        if (typeof el === "undefined")
          throw new Error("stableStringify: undefined array element is not valid JSON");
        assertJsonCompatible(el);
      });
    } else {
      for (const v of Object.values(value as Record<string, unknown>)) {
        if (typeof v === "undefined") continue; // JSON.stringify drops undefined object props
        assertJsonCompatible(v);
      }
    }
  }
  return value;
}

// =============================================================================
// HASH ALGORITHMS
// =============================================================================

/**
 * The canonicalizations a hash can be computed under. A signed `hashAlg` claim on
 * a decision token (and an optional `hashAlg` on a manifest entry) names exactly
 * one of these; the verifier never tries both.
 *
 * - `cesteral-c14n-v1` — {@link stableStringify}, frozen. Sorts keys, then lets
 *   `JSON.stringify` emit them, so the JS engine re-orders integer-like keys ahead
 *   of the rest (`{"9":…,"10":…,"-1":…}`). Every hash minted before this field
 *   existed was computed this way, so an ABSENT claim means this algorithm.
 * - `rfc8785` — RFC 8785 (JCS): properties sorted by UTF-16 code units
 *   (`{"-1":…,"10":…,"9":…}`), which any language can reproduce from the RFC.
 *
 * The two produce identical bytes for every value that has no order-sensitive
 * object (see {@link hasOrderSensitiveKeys}).
 */
export const HASH_ALGS = ["cesteral-c14n-v1", "rfc8785"] as const;
export type HashAlg = (typeof HASH_ALGS)[number];

/** What an absent `hashAlg` means on the wire. */
export const DEFAULT_HASH_ALG: HashAlg = "cesteral-c14n-v1";

export function isHashAlg(value: unknown): value is HashAlg {
  return typeof value === "string" && (HASH_ALGS as readonly string[]).includes(value);
}

function assertHashAlg(alg: unknown): asserts alg is HashAlg {
  if (!isHashAlg(alg)) {
    throw new Error(`unsupported hash algorithm: ${String(alg)}`);
  }
}

/** A UTF-16 surrogate with no partner: not valid I-JSON, so RFC 8785 forbids it. */
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;

function jcsString(s: string): string {
  if (LONE_SURROGATE.test(s)) {
    throw new Error("rfc8785: lone surrogate is not valid I-JSON");
  }
  return JSON.stringify(s);
}

/**
 * RFC 8785 serialization of an already-validated JSON value. The string is built
 * by hand from explicitly sorted keys so the engine's property-enumeration order
 * can never re-order them; numbers, booleans and null use `JSON.stringify`, which
 * is ECMAScript `Number::toString` — the number form RFC 8785 mandates.
 */
function serializeJcs(value: unknown): string {
  if (Array.isArray(value)) {
    const parts: string[] = [];
    for (let i = 0; i < value.length; i++) {
      if (!(i in value)) throw new Error("rfc8785: sparse array hole is not valid JSON");
      parts.push(serializeJcs(value[i]));
    }
    return "[" + parts.join(",") + "]";
  }
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort();
    return "{" + keys.map((k) => jcsString(k) + ":" + serializeJcs(obj[k])).join(",") + "}";
  }
  if (typeof value === "string") return jcsString(value);
  return JSON.stringify(value);
}

/**
 * Canonical JSON text under `alg`. Same fail-loud contract as
 * {@link stableStringify}: non-JSON input throws; undefined object properties are
 * dropped; undefined array elements are rejected. An unknown `alg` throws.
 */
export function canonicalStringify(value: unknown, alg: HashAlg = DEFAULT_HASH_ALG): string {
  assertHashAlg(alg);
  if (alg === "cesteral-c14n-v1") return stableStringify(value);
  if (typeof value === "undefined") {
    throw new Error("stableStringify: undefined is not valid JSON at the root");
  }
  return serializeJcs(assertJsonCompatible(value));
}

/**
 * True when `cesteral-c14n-v1` and `rfc8785` would serialize `value` differently:
 * some object's keys, rebuilt in sorted order exactly as the legacy serializer
 * does, come back from the engine in a different order. Lets a verifier report,
 * per call, whether an argument hash depends on which algorithm is selected.
 */
export function hasOrderSensitiveKeys(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasOrderSensitiveKeys);
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    // `undefined` properties are dropped from the canonical bytes under both
    // algorithms, so they cannot contribute to an ordering difference.
    const sorted = Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort();
    const rebuilt: Record<string, unknown> = {};
    for (const k of sorted) {
      Object.defineProperty(rebuilt, k, {
        value: null,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    if (Object.keys(rebuilt).some((k, i) => k !== sorted[i])) return true;
    return sorted.some((k) => hasOrderSensitiveKeys(obj[k]));
  }
  return false;
}

/**
 * Canonical "executable write args" that both connector and governance hash.
 *
 * Hashes the raw wire arguments MINUS:
 *   - `__`-prefixed internal execution args (mirrors `cesteral-intelligence`
 *     `stripInternalExecutionArgs`, lib/features/mcp/tools/external-governance.ts), and
 *   - the per-contract control fields declared in `executableArgsExclude` (e.g. `dry_run`).
 *
 * Operates on the RAW wire shape, NOT the Zod-parsed output, so Zod
 * defaults/coercions/transforms/unknown-key stripping cannot diverge the hash
 * across repos. Only top-level keys are removed; nested values are preserved
 * verbatim and key-sorted at hash time.
 *
 * actionHash parity is symmetric across both repos:
 *   - governance mints the token's `actionHash` by running this same projection
 *     with the admitted contract's `executableArgsExclude`
 *     (`lib/features/mcp/tools/external-governance.ts`, `buildDecisionTokenHeaders`), and
 *   - the connector recomputes it the same way at verify time
 *     (`@cesteral/shared` `tool-handler-factory.ts`, passing
 *     `cesteralAnnotation.executableArgsExclude`).
 * Both sides therefore strip the control fields before hashing, so a write call
 * carrying e.g. `dry_run` binds to the same `actionHash` on mint and verify.
 */
export function canonicalizeExecutableArgs(opts: { rawArgs: unknown; exclude: string[] }): unknown {
  const { rawArgs, exclude } = opts;
  if (rawArgs === null || typeof rawArgs !== "object" || Array.isArray(rawArgs)) return rawArgs;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rawArgs as Record<string, unknown>)) {
    if (k.startsWith("__")) continue;
    if (exclude.includes(k)) continue;
    out[k] = v;
  }
  return out;
}

/**
 * SHA-256 over `stableStringify(value)` — the canonical hash of a write
 * action's executable arguments. Returns lowercase hex, no prefix.
 *
 * Cross-repo source of truth: `cesteral-intelligence` mints decision-token
 * `actionHash` claims with the equivalent computation
 * (lib/features/governance/decisions/mutations.ts). The connector recomputes it
 * from the received args to bind the token to the actual write.
 */
export function hashActionInput(value: unknown, alg: HashAlg = DEFAULT_HASH_ALG): string {
  return createHash("sha256").update(canonicalStringify(value, alg), "utf8").digest("hex");
}

/**
 * SHA-256 over the canonical governance projection of an MCP tool.
 *
 * Stable across key reorderings, sensitive to any change in
 * name/description/inputSchema/outputSchema/annotations (including any
 * nested `cesteral` namespace). Returns lowercase hex, no prefix.
 *
 * This is the cross-repo source of truth: `cesteral-mcp-servers` uses it
 * to generate per-package attestation manifests, and `cesteral-intelligence`
 * governance uses it to hash observed tools. The two MUST stay
 * bit-identical — see the golden-vector tests.
 *
 * Canonicalization routes through `stableStringify`, so this entrypoint carries
 * the SAME fail-loud guarantee as `hashActionInput`: a non-JSON value smuggled
 * into the projection (BigInt / Date / NaN / Infinity / function / symbol /
 * class instance) throws rather than being silently coerced into a wrong-but-
 * stable hash. For valid wire JSON — which is all `tools/list` ever yields — the
 * canonical bytes are unchanged, so every golden vector still holds.
 */
export function computeDefinitionHash(
  tool: HashableToolDefinition,
  alg: HashAlg = DEFAULT_HASH_ALG
): string {
  const projection: Record<string, unknown> = {};
  for (const field of GOVERNANCE_FIELDS) {
    const v = tool[field as keyof HashableToolDefinition];
    if (v !== undefined) {
      projection[field] = v;
    }
  }
  const canonical = canonicalStringify(projection, alg);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

// Single-sourced cross-repo definitionHash parity vector (see ./cross-repo-golden.ts).
export {
  CROSS_REPO_DEFINITION_HASH_GOLDEN,
  CROSS_REPO_DEFINITION_HASH_GOLDEN_VECTORS,
  CROSS_REPO_GOLDEN_DISTINCTNESS_PAIRS,
  CROSS_REPO_PROTO_POLLUTION_VECTORS,
  CROSS_REPO_HASH_ALG_VECTORS,
  type CrossRepoHashAlgVector,
  type CrossRepoGoldenVector,
  type CrossRepoProtoPollutionVector,
} from "./cross-repo-golden.js";

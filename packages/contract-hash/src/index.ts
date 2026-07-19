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
export function hashActionInput(value: unknown): string {
  return createHash("sha256").update(stableStringify(value), "utf8").digest("hex");
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
export function computeDefinitionHash(tool: HashableToolDefinition): string {
  const projection: Record<string, unknown> = {};
  for (const field of GOVERNANCE_FIELDS) {
    const v = tool[field as keyof HashableToolDefinition];
    if (v !== undefined) {
      projection[field] = v;
    }
  }
  const canonical = stableStringify(projection);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

// Single-sourced cross-repo definitionHash parity vector (see ./cross-repo-golden.ts).
export {
  CROSS_REPO_DEFINITION_HASH_GOLDEN,
  CROSS_REPO_DEFINITION_HASH_GOLDEN_VECTORS,
  CROSS_REPO_GOLDEN_DISTINCTNESS_PAIRS,
  CROSS_REPO_PROTO_POLLUTION_VECTORS,
  type CrossRepoGoldenVector,
  type CrossRepoProtoPollutionVector,
} from "./cross-repo-golden.js";

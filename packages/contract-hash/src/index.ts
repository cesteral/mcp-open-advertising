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
      sorted[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
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
 */
export function computeDefinitionHash(tool: HashableToolDefinition): string {
  const projection: Record<string, unknown> = {};
  for (const field of GOVERNANCE_FIELDS) {
    const v = tool[field as keyof HashableToolDefinition];
    if (v !== undefined) {
      projection[field] = v;
    }
  }
  const canonical = JSON.stringify(sortKeysDeep(projection));
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

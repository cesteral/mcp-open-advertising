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

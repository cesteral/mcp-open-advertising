// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Which status values are a one-way door, per platform.
 *
 * The list lives in ONE place: `registry.json`, `servers[].operational.
 * terminalStatusValues`, beside the `terminalOperations` the server card
 * publishes. It reaches the code through `registry-data.generated.ts` (run by
 * this package's `prebuild`). A tool never keeps its own copy: it asks
 * `terminalStatusValuesFor(TOOL_NAME)`, which throws when the tool is not
 * declared terminal in the registry, so a tool that confirms terminal values
 * and a registry that does not declare it cannot both ship.
 *
 * Matching is case-insensitive on purpose. A platform that spells it `Archived`
 * may still be sent `ARCHIVED` by a caller; a false positive costs one
 * confirmation, a false negative an irreversible write nobody confirmed.
 */

import { REGISTRY_DATA } from "../transport/registry-data.generated.js";

/** Keys whose value is a status. Same shape as the ratchet's `STATUS_KEY` in scripts/lib/destructive-tools.mjs. */
const STATUS_KEY = /status|state|availability/i;

const cache = new Map<string, ReadonlySet<string>>();

/**
 * The terminal status values of the platform that owns `toolName`, upper-cased.
 * Throws when the tool is not in that server's `terminalOperations`, or the
 * server declares no `terminalStatusValues`: both are registry gaps, and they
 * fail at module load, not on the first irreversible call.
 */
export function terminalStatusValuesFor(toolName: string): ReadonlySet<string> {
  const cached = cache.get(toolName);
  if (cached) return cached;
  const server = REGISTRY_DATA.servers.find((s) =>
    s.operational.terminalOperations.some((t) => t.tool === toolName)
  );
  if (!server) {
    throw new Error(
      `${toolName} confirms terminal status values but is not declared in registry.json ` +
        `servers[].operational.terminalOperations. Declare it there and run \`pnpm sync:registry-data\`.`
    );
  }
  if (server.operational.terminalStatusValues.length === 0) {
    throw new Error(
      `${server.package} declares no operational.terminalStatusValues in registry.json, ` +
        `but ${toolName} needs them to decide which status changes are irreversible.`
    );
  }
  const values = new Set(server.operational.terminalStatusValues.map((v) => v.toUpperCase()));
  cache.set(toolName, values);
  return values;
}

/** True when `value` is a string in `terminal` (case-insensitive). */
export function isTerminalStatusValue(terminal: ReadonlySet<string>, value: unknown): boolean {
  return typeof value === "string" && terminal.has(value.toUpperCase());
}

/**
 * The part of `data` an `updateMask` lets through: the top-level keys a mask
 * path starts with (`entityStatus`, `budget.budgetSegments` -> `budget`). A
 * status in `data` that the mask leaves out is not written, so it must not
 * prompt. No mask (or an empty one) returns `data` unchanged.
 */
export function restrictToUpdateMask(
  data: Record<string, unknown>,
  updateMask: string | undefined
): Record<string, unknown> {
  if (!updateMask || updateMask.trim().length === 0) return data;
  const roots = new Set(
    updateMask
      .split(",")
      .map((path) => path.trim().split(".")[0])
      .filter((root): root is string => Boolean(root))
  );
  return Object.fromEntries(Object.entries(data).filter(([key]) => roots.has(key)));
}

/** One terminal value found in a write payload. */
export interface TerminalValueHit {
  /** Dotted path inside the payload, e.g. `entityStatus` or `update.status`. */
  path: string;
  value: string;
}

/**
 * Every terminal value a write payload sets on a status-like key (`status`,
 * `entityStatus`, `Availability`, `operation_status`, `intendedStatus`, ...),
 * walking nested objects and arrays. Empty for an ordinary update, which then
 * must not prompt. Pure.
 */
export function findTerminalStatusValues(
  payload: unknown,
  terminal: ReadonlySet<string>
): TerminalValueHit[] {
  const hits: TerminalValueHit[] = [];
  const walk = (node: unknown, path: string, key: string | undefined): void => {
    if (node === null || node === undefined) return;
    if (typeof node === "string") {
      if (key !== undefined && STATUS_KEY.test(key) && isTerminalStatusValue(terminal, node)) {
        hits.push({ path, value: node });
      }
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((child, i) => walk(child, `${path}[${i}]`, key));
      return;
    }
    if (typeof node === "object") {
      for (const [k, child] of Object.entries(node as Record<string, unknown>)) {
        walk(child, path ? `${path}.${k}` : k, k);
      }
    }
  };
  walk(payload, "", undefined);
  return hits;
}

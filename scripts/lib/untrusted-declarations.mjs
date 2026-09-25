// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// Helpers for the #204 untrusted-content declaration ratchet, shared by
// untrusted-declarations.test.mjs and scripts/sync-untrusted-declarations.mjs.
// See the test's header for what is checked and why.

import { join } from "node:path";
import { ROOT } from "./boot-server.mjs";

export const KEY = "cesteral/untrusted";

export const SNAPSHOT_PATH = join(ROOT, "scripts/lib/untrusted-declarations.snapshot.json");

/** Property names whose subtree may stay open; see the header of untrusted-declarations.test.mjs. */
export const OPEN_EXEMPT_PROPERTIES = new Set(["summary"]);

/** Resolves a local JSON-pointer `$ref` (`#/properties/...`) against `root`. */
function resolveRef(root, ref) {
  if (!ref.startsWith("#")) throw new Error(`non-local $ref ${ref}`);
  return ref
    .slice(1)
    .split("/")
    .filter(Boolean)
    .map((seg) => seg.replace(/~1/g, "/").replace(/~0/g, "~"))
    .reduce((node, seg) => node?.[seg], root);
}

/**
 * True when `schema` admits arbitrary platform-shaped data anywhere inside it.
 * `root` is the tool's whole outputSchema, against which local `$ref`s
 * resolve. The unit cases in untrusted-declarations.test.mjs pin each JSON
 * Schema shape the SDK (or a future zod version) can emit for an open field.
 */
export function isOpen(schema, root = schema, seen = new Set()) {
  if (schema === true || schema === undefined || schema === null) return true;
  if (typeof schema !== "object") return false;
  if (schema.$ref) {
    if (seen.has(schema.$ref)) return false;
    return isOpen(resolveRef(root, schema.$ref), root, new Set([...seen, schema.$ref]));
  }
  for (const key of ["anyOf", "oneOf", "allOf"]) {
    if (Array.isArray(schema[key])) return schema[key].some((s) => isOpen(s, root, seen));
  }
  const types = [].concat(schema.type ?? []);
  if (types.includes("array") && isOpen(schema.items, root, seen)) return true;
  if (types.includes("object")) {
    const extra = schema.additionalProperties;
    if (!schema.properties || (extra !== undefined && extra !== false)) return true;
    return Object.entries(schema.properties).some(
      ([name, sub]) => !OPEN_EXEMPT_PROPERTIES.has(name) && isOpen(sub, root, seen)
    );
  }
  return types.length === 0 && schema.enum === undefined && schema.const === undefined;
}

/** Live declarations for one server, in snapshot form. */
export function declarationsOf(tools) {
  return Object.fromEntries(
    tools
      .filter((t) => t._meta?.[KEY])
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((t) => {
        const { structuredPaths, contentBlocks } = t._meta[KEY];
        return [t.name, { structuredPaths, contentBlocks }];
      })
  );
}

// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Filters an OpenAPI 3.0 spec down to the transitive closure of a root set
 * of operationIds. All paths whose operations are not in the root set are
 * dropped, and components.schemas is reduced to only those reachable via
 * $ref from the kept paths.
 */

interface OpenApiDoc {
  openapi: string;
  info: unknown;
  servers?: unknown;
  paths: Record<string, Record<string, unknown>>;
  components: {
    schemas: Record<string, unknown>;
    parameters?: Record<string, unknown>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

const SCHEMA_REF_PREFIX = "#/components/schemas/";
const PARAM_REF_PREFIX = "#/components/parameters/";

function collectRefs(node: unknown, schemaRefs: Set<string>, paramRefs: Set<string>): void {
  if (node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) collectRefs(item, schemaRefs, paramRefs);
    return;
  }
  const obj = node as Record<string, unknown>;
  for (const [k, v] of Object.entries(obj)) {
    if (k === "$ref" && typeof v === "string") {
      if (v.startsWith(SCHEMA_REF_PREFIX)) {
        schemaRefs.add(v.slice(SCHEMA_REF_PREFIX.length));
      } else if (v.startsWith(PARAM_REF_PREFIX)) {
        paramRefs.add(v.slice(PARAM_REF_PREFIX.length));
      }
    } else {
      collectRefs(v, schemaRefs, paramRefs);
    }
  }
}

export function filterSpecByOperationIds(spec: OpenApiDoc, rootOperationIds: string[]): OpenApiDoc {
  const wantedOps = new Set(rootOperationIds);
  const keptPaths: OpenApiDoc["paths"] = {};

  for (const [pathKey, pathItem] of Object.entries(spec.paths)) {
    const keptOps: Record<string, unknown> = {};
    for (const [method, op] of Object.entries(pathItem)) {
      if (
        op &&
        typeof op === "object" &&
        "operationId" in op &&
        wantedOps.has((op as { operationId: string }).operationId)
      ) {
        keptOps[method] = op;
      }
    }
    if (Object.keys(keptOps).length > 0) {
      keptPaths[pathKey] = keptOps;
    }
  }

  const found = new Set<string>();
  for (const item of Object.values(keptPaths)) {
    for (const op of Object.values(item)) {
      if (op && typeof op === "object" && "operationId" in op) {
        found.add((op as { operationId: string }).operationId);
      }
    }
  }
  const missing = [...wantedOps].filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw new Error(`Root operations not found in spec: ${missing.join(", ")}`);
  }

  const schemaRefs = new Set<string>();
  const paramRefs = new Set<string>();
  collectRefs(keptPaths, schemaRefs, paramRefs);

  let added = true;
  while (added) {
    added = false;
    for (const name of [...schemaRefs]) {
      const schema = spec.components.schemas[name];
      if (!schema) continue;
      const before = { s: schemaRefs.size, p: paramRefs.size };
      collectRefs(schema, schemaRefs, paramRefs);
      if (schemaRefs.size > before.s || paramRefs.size > before.p) added = true;
    }
    for (const name of [...paramRefs]) {
      const param = spec.components.parameters?.[name];
      if (!param) continue;
      const before = { s: schemaRefs.size, p: paramRefs.size };
      collectRefs(param, schemaRefs, paramRefs);
      if (schemaRefs.size > before.s || paramRefs.size > before.p) added = true;
    }
  }

  const keptSchemas: Record<string, unknown> = {};
  for (const name of schemaRefs) {
    if (spec.components.schemas[name]) {
      keptSchemas[name] = spec.components.schemas[name];
    }
  }
  const keptParams: Record<string, unknown> = {};
  if (spec.components.parameters) {
    for (const name of paramRefs) {
      if (spec.components.parameters[name]) {
        keptParams[name] = spec.components.parameters[name];
      }
    }
  }

  return {
    ...spec,
    paths: keptPaths,
    components: {
      ...spec.components,
      schemas: keptSchemas,
      parameters: keptParams,
    },
  };
}

// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// Renders a server template from layers. A server type is a list of layer
// directories under templates/server/ (TEMPLATE_TYPES); each layer's files are
// rendered in order, and a later layer's file replaces an earlier one at the
// same path (only where SHADOWED says why, render.test.mjs). A layer's
// `+writes/` subtree is rendered only for a server with write tools
// (`--with-writes`, `--add-write-stubs`), as if it sat at the layer's root.
//
// `{{name}}` placeholders are replaced in paths and contents; a placeholder
// with no value throws, so a template edit cannot ship `{{...}}` into a
// package. Sections: the lines between a line containing `{{#writes}}` and
// one containing `{{/writes}}` are kept only with writes; `{{^writes}}` …
// `{{/writes}}` only without. The marker lines themselves are dropped, so a
// marker can sit in a comment of any syntax.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

export const TEMPLATE_DIR = join(import.meta.dirname, "../../templates/server");

/** 1-based lines of the API base URL and the rate-limit default in the template's src/config/index.ts. */
export const CONFIG_LINES = { baseUrl: 24, rateLimit: 26 };

const WRITES_DIR = "+writes";

/**
 * Each type's layers, the tools its template registers (barrel order, without
 * the key prefix) and the subset that are governed writes.
 */
export const TEMPLATE_TYPES = {
  management: {
    layers: ["base", "entities", "management"],
    tools: [
      "list_accounts",
      "list_entities",
      "get_entity",
      "create_entity",
      "update_entity",
      "delete_entity",
      "bulk_update_status",
      "validate_entity",
      "get_pacing_status",
      "search_tools",
    ],
    writeTools: ["create_entity", "update_entity", "delete_entity", "bulk_update_status"],
    addedWithWrites: ["create_entity", "update_entity", "delete_entity", "bulk_update_status"],
  },
};

/** Paths a later layer may replace, with the reason (render.test.mjs holds the rest to none). */
export const SHADOWED = {};

function typeOf(type) {
  const t = TEMPLATE_TYPES[type];
  if (!t)
    throw new Error(
      `unknown server type "${type}"; one of ${Object.keys(TEMPLATE_TYPES).join(", ")}`
    );
  return t;
}

/** The governed write tools a type's stubs add. */
export function WRITE_TOOLS(key, type = "management") {
  return typeOf(type).writeTools.map((t) => `${key}_${t}`);
}

/** The tools a type's template registers, in barrel order. */
export function TEMPLATE_TOOLS(key, { type = "management", writes = false } = {}) {
  const t = typeOf(type);
  return t.tools
    .filter((name) => writes || !t.addedWithWrites.includes(name))
    .map((name) => `${key}_${name}`);
}

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]
  );
}

/** `path relative to the package → absolute template file` for one layer. */
function layerMap(root, layer, writes) {
  const dir = join(root, layer);
  const out = new Map();
  for (const abs of walk(dir)) {
    const rel = relative(dir, abs);
    if (rel.split("/")[0] === WRITES_DIR) continue;
    out.set(rel, abs);
  }
  if (writes) {
    const wdir = join(dir, WRITES_DIR);
    for (const abs of walk(wdir)) out.set(relative(wdir, abs), abs);
  }
  return out;
}

/** Template paths one layer contributes (write files included). */
export function layerFiles(root, layer) {
  return [...layerMap(root, layer, true).keys()];
}

/** Apply `{{#writes}}` / `{{^writes}}` sections (see the header). */
function sections(text, writes, where) {
  const out = [];
  let keep = null; // null outside a section
  for (const line of text.split("\n")) {
    if (line.includes("{{#writes}}") || line.includes("{{^writes}}")) {
      if (keep !== null) throw new Error(`${where}: nested writes section`);
      keep = line.includes("{{#writes}}") ? writes : !writes;
      continue;
    }
    if (line.includes("{{/writes}}")) {
      if (keep === null) throw new Error(`${where}: {{/writes}} without an opening marker`);
      keep = null;
      continue;
    }
    if (keep !== false) out.push(line);
  }
  if (keep !== null) throw new Error(`${where}: unclosed writes section`);
  return out.join("\n");
}

function fill(text, vars, where) {
  return text.replace(/\{\{([A-Za-z]+)\}\}/g, (match, name) => {
    if (!(name in vars)) throw new Error(`${where}: no value for placeholder ${match}`);
    return vars[name];
  });
}

/** Path (relative to the package) → rendered text, for `type`. */
export function renderTemplate(root, type, vars, { writes = false } = {}) {
  const files = new Map();
  for (const layer of typeOf(type).layers) {
    for (const [rel, abs] of layerMap(root, layer, writes)) files.set(rel, { layer, abs });
  }
  const out = new Map();
  for (const [rel, { layer, abs }] of files) {
    const where = `${layer}/${rel}`;
    out.set(
      fill(rel, vars, where),
      fill(sections(readFileSync(abs, "utf8"), writes, where), vars, where)
    );
  }
  return out;
}

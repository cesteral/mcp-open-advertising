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
// `{{/writes}}` only without. `{{#entityWrites}}` … `{{/entityWrites}}` is
// kept only with writes on a type whose writes include entity writes (the
// `entityWrites` flag on TEMPLATE_TYPES), for text such as the governed read
// partner that only those writes use. The marker lines themselves are
// dropped, so a marker can sit in a comment of any syntax.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

export const TEMPLATE_DIR = join(import.meta.dirname, "../../templates/server");

/** 1-based lines of the API base URL and the rate-limit default in the template's src/config/index.ts. */
export const CONFIG_LINES = { baseUrl: 24, rateLimit: 26 };

const WRITES_DIR = "+writes";

/**
 * Each type's layers, the tools its template registers (barrel order, without
 * the key prefix) and the subset that are governed writes. `entityWrites`:
 * some of those writes change entities and name `get_entity` as their
 * `readPartner`, so `get_entity` is a governed read; effect writes (a report
 * job, a conversion upload) have no read partner.
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
      "get_report",
      "get_pacing_status",
      "search_tools",
    ],
    writeTools: ["create_entity", "update_entity", "delete_entity", "bulk_update_status"],
    addedWithWrites: ["create_entity", "update_entity", "delete_entity", "bulk_update_status"],
    terminalTools: ["delete_entity"],
    entityWrites: true,
    pacingGuidance:
      "To populate budget and flight dates, first call `{{key}}_get_entity` for the campaign.",
    label: "Management",
    purpose: "campaign management",
    description: "management — entity CRUD, validation, reporting and pacing",
    runtime: "campaigns and child entities, reports",
  },
  reporting: {
    layers: ["base", "reports", "reporting"],
    tools: [
      "list_accounts",
      "get_report",
      "submit_report",
      "check_report_status",
      "download_report",
      "get_pacing_status",
      "search_tools",
    ],
    writeTools: ["submit_report"],
    addedWithWrites: ["submit_report", "check_report_status", "download_report"],
    terminalTools: [],
    entityWrites: false,
    pacingGuidance:
      "To populate spend-to-date, first call `{{key}}_get_report` for the campaign; budget and flight dates come from the caller.",
    label: "Reporting only",
    purpose: "reporting",
    description: "reporting — synchronous and async reports, pacing",
    runtime: "performance reports",
  },
  reporting_conversions: {
    layers: ["base", "entities", "reports", "reporting_conversions"],
    tools: [
      "list_accounts",
      "list_entities",
      "get_entity",
      "validate_entity",
      "get_report",
      "submit_report",
      "check_report_status",
      "download_report",
      "insert_conversions",
      "get_pacing_status",
      "search_tools",
    ],
    writeTools: ["submit_report", "insert_conversions"],
    addedWithWrites: [
      "submit_report",
      "check_report_status",
      "download_report",
      "insert_conversions",
    ],
    terminalTools: [],
    entityWrites: false,
    pacingGuidance:
      "To populate budget and flight dates, first call `{{key}}_get_entity` for the campaign.",
    label: "Reporting + conversions",
    purpose: "reporting and conversion upload",
    description: "reporting and conversions — entities, reports, offline conversion upload, pacing",
    runtime: "entities, performance reports, offline conversions",
  },
};

/** The per-type metadata other scaffold modules read (labels, terminal tools). */
export function templateType(type) {
  return typeOf(type);
}

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

/** Apply the `{{#flag}}` / `{{^flag}}` sections (see the header). */
function sections(text, flags, where) {
  const out = [];
  let open = null; // { name, keep } inside a section
  for (const line of text.split("\n")) {
    const m = line.match(/\{\{([#^/])([A-Za-z]+)\}\}/);
    if (!m) {
      if (open?.keep !== false) out.push(line);
      continue;
    }
    const [, op, name] = m;
    if (!(name in flags)) throw new Error(`${where}: unknown section {{${op}${name}}}`);
    if (op === "/") {
      if (open?.name !== name) throw new Error(`${where}: {{/${name}}} without an opening marker`);
      open = null;
    } else {
      if (open !== null) throw new Error(`${where}: nested ${name} section`);
      open = { name, keep: op === "#" ? flags[name] : !flags[name] };
    }
  }
  if (open !== null) throw new Error(`${where}: unclosed ${open.name} section`);
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
  // Per-type text a base file needs (the pacing tool names the type's own
  // budget source), itself filled from the caller's vars.
  vars = {
    ...vars,
    pacingGuidance: fill(typeOf(type).pacingGuidance, vars, `${type} pacingGuidance`),
  };
  const flags = { writes, entityWrites: writes && typeOf(type).entityWrites };
  const files = new Map();
  for (const layer of typeOf(type).layers) {
    for (const [rel, abs] of layerMap(root, layer, writes)) files.set(rel, { layer, abs });
  }
  const out = new Map();
  for (const [rel, { layer, abs }] of files) {
    const where = `${layer}/${rel}`;
    out.set(
      fill(rel, vars, where),
      fill(sections(readFileSync(abs, "utf8"), flags, where), vars, where)
    );
  }
  return out;
}

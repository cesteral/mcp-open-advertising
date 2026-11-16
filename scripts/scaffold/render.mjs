// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// Renders a server template: every file under the template directory, with
// `{{name}}` placeholders replaced in paths and contents. A placeholder with
// no value throws, so a template edit cannot ship `{{...}}` into a package.
//
// Sections: the lines between a line containing `{{#writes}}` and one
// containing `{{/writes}}` are kept only for a server with write tools
// (`--with-writes`, `--add-write-stubs`); `{{^writes}}` … `{{/writes}}` only
// for one without. The marker lines themselves are dropped, so a marker can
// sit in a comment of any syntax. WRITE_ONLY_FILES are rendered only with
// writes.

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

export const TEMPLATE_DIR = join(import.meta.dirname, "../../templates/server");

/** 1-based lines of the API base URL and the rate-limit default in the template's src/config/index.ts. */
export const CONFIG_LINES = { baseUrl: 24, rateLimit: 26 };

/** Template files (paths as in the template) a read-only server does not get. */
export const WRITE_ONLY_FILES = [
  "src/mcp-server/tools/definitions/create-entity.tool.ts",
  "src/mcp-server/tools/definitions/update-entity.tool.ts",
  "src/mcp-server/tools/definitions/delete-entity.tool.ts",
  "src/mcp-server/tools/definitions/bulk-update-status.tool.ts",
  "src/mcp-server/tools/utils/not-implemented.ts",
];

const WRITE_TOOL_SUFFIXES = [
  "create_entity",
  "update_entity",
  "delete_entity",
  "bulk_update_status",
];

/** The governed write stubs the template can add. */
export function WRITE_TOOLS(key) {
  return WRITE_TOOL_SUFFIXES.map((t) => `${key}_${t}`);
}

/** The tools the management template registers, in barrel order. */
export function TEMPLATE_TOOLS(key, { writes = false } = {}) {
  const all = [
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
  ].map((t) => `${key}_${t}`);
  return writes ? all : all.filter((t) => !WRITE_TOOLS(key).includes(t));
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

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]
  );
}

function fill(text, vars, where) {
  return text.replace(/\{\{([A-Za-z]+)\}\}/g, (match, name) => {
    if (!(name in vars)) throw new Error(`${where}: no value for placeholder ${match}`);
    return vars[name];
  });
}

/** Path (relative to the package) → rendered text. */
export function renderTemplate(templateDir, vars, { writes = false } = {}) {
  const out = new Map();
  for (const abs of walk(templateDir)) {
    const rel = relative(templateDir, abs);
    if (!writes && WRITE_ONLY_FILES.includes(rel)) continue;
    out.set(
      fill(rel, vars, rel),
      fill(sections(readFileSync(abs, "utf8"), writes, rel), vars, rel)
    );
  }
  return out;
}

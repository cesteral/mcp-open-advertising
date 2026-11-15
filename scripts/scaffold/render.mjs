// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// Renders a server template: every file under the template directory, with
// `{{name}}` placeholders replaced in paths and contents. A placeholder with
// no value throws, so a template edit cannot ship `{{...}}` into a package.

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

export const TEMPLATE_DIR = join(import.meta.dirname, "../../templates/server");

/** 1-based lines of the API base URL and the rate-limit default in the template's src/config/index.ts. */
export const CONFIG_LINES = { baseUrl: 24, rateLimit: 26 };

/** The tools the management template registers, in barrel order. */
export function TEMPLATE_TOOLS(key) {
  return [
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
export function renderTemplate(templateDir, vars) {
  const out = new Map();
  for (const abs of walk(templateDir)) {
    const rel = relative(templateDir, abs);
    out.set(fill(rel, vars, rel), fill(readFileSync(abs, "utf8"), vars, rel));
  }
  return out;
}

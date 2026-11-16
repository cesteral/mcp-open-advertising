// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// `pnpm new:server <key> --add-write-stubs`: give an experimental read-only
// server the governed write stubs it needs before it can be promoted.
//
// It renders the template twice with the server's own values, read-only and
// with writes. A template file only the write render has (a stub) is created.
// A file both renders have but that differs (it carries a `{{#writes}}`
// section) is re-rendered only where the package's copy is still byte for byte
// the read-only render; a file the contributor has changed is left alone and
// returned in `manual` with the lines to add and remove, because merging into
// someone's edits is a guess. The registry entry becomes governed, with the
// delete terminal and the write tools listed, and the README row's tool count
// follows. Pure: it writes nothing; applyPlan does.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { names, terminalOperation } from "./entries.mjs";
import { TEMPLATE_DIR, TEMPLATE_TOOLS, renderTemplate, templateType } from "./render.mjs";
import { ScaffoldError, format } from "./scaffold.mjs";

/** The variables the server was scaffolded with, read back from what the scaffold wrote. */
function scaffoldVars(root, entry) {
  const facts = JSON.parse(readFileSync(join(root, "platform-facts.json"), "utf8")).facts;
  const fact = (id) => facts.find((f) => f.id === id)?.value;
  const key = entry.tool_prefix;
  const baseUrl = fact(`${key}.api_base`);
  const rate = /^default\((\d+)\)$/.exec(fact(`${key}.rate_limit_default`) ?? "")?.[1];
  if (!baseUrl || !rate) {
    throw new ScaffoldError(
      `platform-facts.json has no ${key}.api_base / ${key}.rate_limit_default to render the template with`
    );
  }
  return {
    ...names(key),
    displayName: entry.platform_display_name,
    port: String(entry.port),
    baseUrl,
    docsUrl: entry.documentation_url,
    rateLimitPerMinute: rate,
  };
}

/** Replace the registry entry for `pkg` in the file's text with `entry`, leaving the rest as it is. */
export function replaceRegistryEntry(text, pkg, entry) {
  const at = text.indexOf(`"package": "${pkg}"`);
  const open = at < 0 ? -1 : text.lastIndexOf("\n    {", at);
  const close = open < 0 ? -1 : text.indexOf("\n    }", at);
  if (close < 0) throw new ScaffoldError(`registry.json: cannot find the ${pkg} entry`);
  const body = JSON.stringify(entry, null, 2)
    .split("\n")
    .map((l) => `    ${l}`)
    .join("\n");
  return `${text.slice(0, open + 1)}${body}${text.slice(close + "\n    }".length)}`;
}

const lines = (t) => t.split("\n");

/**
 * Returns `{ writes, created, modified, manual }`; `manual` lists
 * `{ path, add, remove }` for files the contributor has changed.
 */
export async function planAddWrites(root, key) {
  const registryText = readFileSync(join(root, "registry.json"), "utf8");
  const registry = JSON.parse(registryText);
  const entry = registry.servers.find((s) => s.tool_prefix === key);
  if (!entry) throw new ScaffoldError(`no server with tool_prefix "${key}" in registry.json`);
  if (entry.status !== "experimental") {
    throw new ScaffoldError(
      `${entry.package} is not experimental; add write tools to a stable server by hand`
    );
  }
  const pkgDir = `packages/${entry.package}`;
  if (!existsSync(join(root, pkgDir))) throw new ScaffoldError(`${pkgDir} does not exist`);

  const vars = scaffoldVars(root, entry);
  const prefixed = (m) => new Map([...m].map(([p, t]) => [`${pkgDir}/${p}`, t]));
  const readOnly = await format(prefixed(renderTemplate(TEMPLATE_DIR, entry.type, vars)));
  const withWrites = await format(
    prefixed(renderTemplate(TEMPLATE_DIR, entry.type, vars, { writes: true }))
  );

  const writes = new Map();
  const created = [];
  const modified = [];
  const manual = [];
  for (const [path, text] of withWrites) {
    if (!readOnly.has(path)) {
      if (existsSync(join(root, path))) throw new ScaffoldError(`${path} already exists`);
      writes.set(path, text);
      created.push(path);
      continue;
    }
    const before = readOnly.get(path);
    if (before === text) continue;
    const current = existsSync(join(root, path)) ? readFileSync(join(root, path), "utf8") : null;
    if (current === before) {
      writes.set(path, text);
      modified.push(path);
    } else {
      const was = new Set(lines(before));
      const now = new Set(lines(text));
      manual.push({
        path,
        add: lines(text).filter((l) => !was.has(l)),
        remove: lines(before).filter((l) => !now.has(l)),
      });
    }
  }

  // Every tool the write stage adds (reads such as check_report_status too),
  // not only the governed writes: registry `tools` and the README count must
  // match what the server registers.
  const readOnlyTools = TEMPLATE_TOOLS(key, { type: entry.type });
  const added = TEMPLATE_TOOLS(key, { type: entry.type, writes: true }).filter(
    (t) => !readOnlyTools.includes(t) && !entry.tools.includes(t)
  );
  const tools = [...entry.tools, ...added];
  const governedEntry = {
    ...entry,
    governed: true,
    tools,
    operational: {
      ...entry.operational,
      terminalOperations: [
        ...(entry.operational?.terminalOperations ?? []),
        ...templateType(entry.type)
          .terminalTools.map((t) => `${key}_${t}`)
          .filter((t) => !(entry.operational?.terminalOperations ?? []).some((o) => o.tool === t))
          .map(terminalOperation),
      ],
    },
  };
  const readme = readFileSync(join(root, "README.md"), "utf8");
  const row = new RegExp(
    `^(\\|\\s*\\[${entry.package}\\]\\([^)]+\\)\\s*\\|[^|]+\\|\\s*)(\\d+)(\\s*\\|)`,
    "m"
  );
  if (!row.test(readme))
    throw new ScaffoldError(`README.md: no fleet-table row for ${entry.package}`);
  const top = await format(
    new Map([
      ["registry.json", replaceRegistryEntry(registryText, entry.package, governedEntry)],
      ["README.md", readme.replace(row, (_m, a, n, b) => `${a}${Number(n) + added.length}${b}`)],
    ])
  );
  for (const [path, text] of top) {
    writes.set(path, text);
    modified.push(path);
  }
  return { writes, created, modified, manual };
}

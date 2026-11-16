// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// Adds a new server to every hand-maintained fleet list that
// scripts/lib/fleet-inventory.mjs checks (INVENTORY_SITES), so a scaffolded
// server passes the fleet-inventory check without hand edits.
//
// Each inserter appends after the last entry of its list and keeps the file's
// formatting. Terraform maps are re-aligned the way `terraform fmt` aligns
// them, because CI runs `terraform fmt -check`. Markdown tables are left for
// prettier, which the scaffold runs over every file it writes.
//
// A missing anchor throws instead of skipping: a list that moved or was
// reformatted must be fixed here, not silently left without the new server.
//
// type ScaffoldServer = {
//   key, package, Pascal, ENV, displayName, authMode,
//   secretEnvVars: Record<ENV_NAME, { secret_name, version }>,
// }

import { DEPLOY_SITE_FILES } from "../lib/fleet-inventory.mjs";
import { templateType } from "./render.mjs";

function missing(file, list) {
  return new Error(`${file}: cannot find ${list} to insert into`);
}

/** Insert `lines` after line index `at` of `text`. */
function insertLinesAfter(text, at, lines) {
  const all = text.split("\n");
  all.splice(at + 1, 0, ...lines);
  return all.join("\n");
}

/** Index of the last line in [from, to) of `lines` that matches `re`, or -1. */
function lastMatching(lines, re, from = 0, to = lines.length) {
  for (let i = to - 1; i >= from; i--) if (re.test(lines[i])) return i;
  return -1;
}

/**
 * Add `"key" = value` to the one-line-per-entry HCL map whose opening line
 * matches `openRe`, and re-align every entry's `=` as `terraform fmt` does.
 */
function insertHclMapEntry(text, file, list, openRe, key, value) {
  const lines = text.split("\n");
  const open = lines.findIndex((l) => openRe.test(l));
  if (open < 0) throw missing(file, list);
  const indent = lines[open].match(/^ */)[0];
  const close = lines.findIndex((l, i) => i > open && l === `${indent}}`);
  if (close < 0) throw missing(file, list);
  const entryRe = /^(\s+)("[^"]+")\s+= (.+)$/;
  const last = lastMatching(lines, entryRe, open + 1, close);
  if (last < 0) throw missing(file, list);
  const entryIndent = lines[last].match(entryRe)[1];
  const body = lines.slice(open + 1, close);
  body.splice(last - open, 0, `${entryIndent}"${key}" = ${value}`);
  const width = Math.max(...body.map((l) => l.match(entryRe)?.[2].length ?? 0));
  const aligned = body.map((l) => {
    const m = l.match(entryRe);
    return m ? `${m[1]}${m[2].padEnd(width)} = ${m[3]}` : l;
  });
  return [...lines.slice(0, open + 1), ...aligned, ...lines.slice(close)].join("\n");
}

/** The Cloud Build `images:` list: both tags of the new server. */
function insertCloudBuildImages(file) {
  return (text, s) => {
    const lines = text.split("\n");
    const start = lines.findIndex((l) => /^images:/.test(l));
    const last =
      start < 0 ? -1 : lastMatching(lines, /\/[a-z0-9-]+-mcp:\$\{_ENVIRONMENT\}-latest'$/, start);
    if (last < 0) throw missing(file, "the images: list");
    const prefix = lines[last].replace(/[a-z0-9-]+-mcp:\$\{_ENVIRONMENT\}-latest'$/, "");
    return insertLinesAfter(text, last, [
      `${prefix}${s.package}:\${SHORT_SHA}'`,
      `${prefix}${s.package}:\${_ENVIRONMENT}-latest'`,
    ]);
  };
}

/** Line indices [first, last] of the `options:` list of the dropdown with `id: <id>`. */
function dropdownOptionLines(lines, id) {
  const idLine = lines.findIndex((l) => new RegExp(`^\\s+id: ${id}\\s*$`).test(l));
  if (idLine < 0) return null;
  const opts = lines.findIndex((l, i) => i > idLine && /^\s+options:\s*$/.test(l));
  if (opts < 0) return null;
  let end = opts;
  while (/^\s+- .+/.test(lines[end + 1] ?? "")) end++;
  return end > opts ? [opts + 1, end] : null;
}

function insertIssueFormServer(file) {
  return (text, s) => {
    const lines = text.split("\n");
    const range = dropdownOptionLines(lines, "server");
    const last = range
      ? lastMatching(lines, /^\s+- [a-z0-9-]+-mcp\s*$/, range[0], range[1] + 1)
      : -1;
    if (last < 0) throw missing(file, "the server dropdown");
    const indent = lines[last].match(/^\s+/)[0];
    let out = insertLinesAfter(text, last, [`${indent}- ${s.package}`]);
    if (file.endsWith("bug_report.yml")) out = insertAuthMode(out, file, s.authMode);
    return out;
  };
}

function insertAuthMode(text, file, mode) {
  const lines = text.split("\n");
  const range = dropdownOptionLines(lines, "auth-mode");
  if (!range) throw missing(file, "the auth-mode dropdown");
  const options = lines.slice(range[0], range[1] + 1).map((l) => l.replace(/^\s+- /, "").trim());
  if (options.includes(mode)) return text;
  const indent = lines[range[1]].match(/^\s+/)[0];
  return insertLinesAfter(text, range[1], [`${indent}- ${mode}`]);
}

/** Append `row` after the last line matching `rowRe` within the section headed `heading`. */
function insertTableRow(text, file, list, heading, rowRe, row) {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => l.trim() === heading);
  if (start < 0) throw missing(file, list);
  let end = lines.findIndex((l, i) => i > start && /^#{1,2} /.test(l));
  if (end < 0) end = lines.length;
  const last = lastMatching(lines, rowRe, start + 1, end);
  if (last < 0) throw missing(file, list);
  return insertLinesAfter(text, last, [row]);
}

function hclSecretEntry(s) {
  const vars = Object.entries(s.secretEnvVars).flatMap(([name, { secret_name, version }]) => [
    `      ${name} = {`,
    `        secret_name = "${secret_name}"`,
    `        version     = "${version}"`,
    `      }`,
  ]);
  return [`    "${s.package}" = {`, ...vars, `    }`];
}

const REPORT_ERRORS = "packages/shared/src/utils/reporting/report-errors.ts";
const REPORT_SCHEDULE = "packages/shared/src/schemas/report-schedule.ts";

/**
 * The reporting platform enums (scripts/lib/platform-keys.mjs
 * checkPlatformNames): every server that ships a reporting tool is listed by
 * its platform key, and every template ships get_report.
 */
function insertReportingPlatform(text, s) {
  const m = text.match(/export type ReportingPlatform =([^;]+);/);
  if (!m) throw missing(REPORT_ERRORS, "the ReportingPlatform union");
  const at = text.indexOf(m[0]) + m[0].length - 1; // the closing ";"
  return `${text.slice(0, at)}\n  | "${s.key}"${text.slice(at)}`;
}

function insertSchedulePlatform(text, s) {
  const m = text.match(/platform: z\.enum\(\[\n([\s\S]*?)\n(\s*)\]\)/);
  if (!m) throw missing(REPORT_SCHEDULE, "the report-schedule platform enum");
  const close = text.indexOf(m[0]) + m[0].length - `\n${m[2]}])`.length;
  const indent = m[1].split("\n").at(-1).match(/^\s*/)[0];
  return `${text.slice(0, close)}\n${indent}"${s.key}",${text.slice(close)}`;
}

export const SITE_INSERTERS = {
  [REPORT_ERRORS]: insertReportingPlatform,
  [REPORT_SCHEDULE]: insertSchedulePlatform,

  "cloudbuild.yaml": insertCloudBuildImages("cloudbuild.yaml"),
  "cloudbuild-manual.yaml": insertCloudBuildImages("cloudbuild-manual.yaml"),

  "terraform/main.tf": (text, s) =>
    insertHclMapEntry(
      text,
      "terraform/main.tf",
      "service_auth_defaults",
      /^\s+service_auth_defaults = \{$/,
      s.package,
      `"${s.authMode}"`
    ),

  "terraform/variables.tf": (text, s) => {
    const file = "terraform/variables.tf";
    const lines = text.split("\n");
    const variable = lines.findIndex((l) => l === 'variable "mcp_secret_env_vars" {');
    const open = lines.findIndex((l, i) => i > variable && l === "  default = {");
    const close = open < 0 ? -1 : lines.findIndex((l, i) => i > open && l === "  }");
    if (variable < 0 || close < 0) throw missing(file, "the mcp_secret_env_vars default");
    return insertLinesAfter(text, close - 1, hclSecretEntry(s));
  },

  ...Object.fromEntries(
    ["dev", "prod"].map((env) => {
      const file = `terraform/${env}.tfvars.example`;
      return [
        file,
        (text, s) => {
          const sample = text.match(/^\s+"[a-z0-9-]+-mcp"\s+= "(.+\/)[a-z0-9-]+-mcp:latest"$/m);
          if (!sample) throw missing(file, "mcp_images");
          return insertHclMapEntry(
            text,
            file,
            "mcp_images",
            /^mcp_images = \{$/,
            s.package,
            `"${sample[1]}${s.package}:latest"`
          );
        },
      ];
    })
  ),

  ...Object.fromEntries(
    ["bug_report.yml", "feature_request.yml", "new_tool_proposal.yml"].map((name) => {
      const file = `.github/ISSUE_TEMPLATE/${name}`;
      return [file, insertIssueFormServer(file)];
    })
  ),

  "docs/CROSS_SERVER_CONTRACT.md": (text, s) =>
    insertTableRow(
      text,
      "docs/CROSS_SERVER_CONTRACT.md",
      "the Server Inventory table",
      "## Server Inventory",
      /^\| [a-z0-9-]+-mcp +\|/,
      `| ${s.package} | \`${s.key}\` | ${templateType(s.type ?? "management").label} | \`accountId\` |`
    ),

  "docs/guides/platform-mapping.md": (text, s) =>
    insertTableRow(
      text,
      "docs/guides/platform-mapping.md",
      "the Current Platforms table",
      "## Current Platforms",
      /^\|[^|\n]+\| `packages\/[a-z0-9-]+-mcp`/,
      `| ${s.displayName} | \`packages/${s.package}\` | ${s.displayName} ${templateType(s.type ?? "management").purpose} | Experimental |`
    ),
};

/**
 * Inventory site files with `s` inserted: file → new text. `deploy` covers the
 * lists that feed publish and deploy (DEPLOY_SITE_FILES: an experimental
 * server stays out of them until `pnpm promote:server`), `listing` the rest.
 */
export function insertIntoSites(readFile, s, { deploy = true, listing = true } = {}) {
  return new Map(
    Object.entries(SITE_INSERTERS)
      .filter(([file]) => (DEPLOY_SITE_FILES.includes(file) ? deploy : listing))
      .map(([file, insert]) => [file, insert(readFile(file), s)])
  );
}

/** Append the new server's row to README.md's fleet table (read by check:doc-tool-counts). */
export function insertReadmeRow(text, s) {
  return insertTableRow(
    text,
    "README.md",
    "the fleet table",
    "## The Full Fleet",
    /^\|\s*\[[a-z0-9-]+-mcp\]\([^)]+\)\s*\|/,
    `| [${s.package}](packages/${s.package}) | ${s.displayName} | ${s.toolCount} | ${s.authLabel} |`
  );
}

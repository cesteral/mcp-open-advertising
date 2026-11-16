// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// Fleet inventory completeness: every place that lists the servers by hand
// must list exactly the servers in registry.json.
//
// registry.json is what manifests, server.json, the runtime tool checks and the
// server card read. Those checks cannot see a server that is missing from some
// OTHER list. Before this check, leaving a new server out of `publish-all.sh`
// meant it was never released, leaving it out of `cloudbuild.yaml` meant it was
// never built or deployed, and leaving it out of the conformance script meant
// CI skipped it. All of that went silently, and two lists had already drifted
// (platform-mapping.md had no MS Ads row; the bug-report auth list named a
// `ttd-headers` mode that never shipped and lacked `gads-headers`).
//
// Each site below is a hand-maintained list. A site whose pattern matches
// nothing is itself a violation, so moving or reformatting a file cannot turn
// its check into a silent pass. The test also runs every site against a
// registry with an extra, fake server, so no site can be vacuous.
//
// Configured sites only prove that the lists they name are complete. CENSUS
// (below) covers the rest of each file where it can: in a file that should
// mention every server equally often, a server mentioned less often is missing
// from some list, configured or not. Files that cannot be censused say why.
//
// The scripts, Cloud Build's steps and the Dockerfile no longer keep lists:
// they read registry.json (`scripts/fleet.mjs`, `pnpm fetch`). DERIVED keeps
// them that way, and the registry fields they rely on (`port`, `tool_prefix`)
// are checked against the code. What remains here is static configuration
// that cannot read the registry (Cloud Build `images:`, issue forms, docs) and
// the three per-service maps Terraform still keys by hand (auth defaults,
// secret mappings, example images). Its modules, outputs, monitoring and load
// balancer iterate the registry.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { derivePrefix } from "../../evals/lib/merged-catalog.mjs";
import { deployableServers } from "./server-status.mjs";

/**
 * Hand-maintained lists that feed publish and deploy. They cover stable
 * servers only (registry `status`): an experimental server is built and tested
 * in CI, but never given an image, a Cloud Run service or a release.
 */
export const DEPLOY_SITE_FILES = [
  "cloudbuild.yaml",
  "cloudbuild-manual.yaml",
  "terraform/main.tf",
  "terraform/variables.tf",
  "terraform/dev.tfvars.example",
  "terraform/prod.tfvars.example",
];

/** Scripts and Cloud Build configs that publish or deploy: they read `fleet.mjs deployable`. */
export const DEPLOY_CONSUMERS = [
  "scripts/publish-all.sh",
  "scripts/deploy.sh",
  "scripts/smoke-test.sh",
  "cloudbuild.yaml",
  "cloudbuild-manual.yaml",
];

const deployablePackages = (servers) => deployableServers({ servers }).map((s) => s.package);

const SERVER_TOKEN = /\b[a-z0-9]+(?:-[a-z0-9]+)*-mcp\b/g;

/** Server-package tokens in a block of text, in order, deduplicated. */
export function serverTokens(text) {
  return [...new Set(text.match(SERVER_TOKEN) ?? [])];
}

/** Every capture group 1 of `regex` in `text`. */
function captures(text, regex) {
  return [...text.matchAll(regex)].map((m) => m[1]);
}

/** `amazon_dsp_mcp` → `amazon-dsp-mcp` (Terraform identifiers back to package names). */
function hyphenated(name) {
  return name.replaceAll("_", "-");
}

/** `amazon_dsp` (Terraform short service name) → `amazon-dsp-mcp`. */
function fromShort(name) {
  return `${name.replaceAll("_", "-")}-mcp`;
}

/** Entries of a YAML dropdown's `options:` list in the block with `id: <id>`. */
function dropdownOptions(text, id) {
  const start = text.search(new RegExp(`^\\s+id: ${id}\\s*$`, "m"));
  if (start < 0) return null;
  const opts = text.slice(start).match(/options:\n((?:\s+- .+\n)+)/);
  if (!opts) return null;
  return opts[1]
    .split("\n")
    .map((l) => l.replace(/^\s+- /, "").trim())
    .filter(Boolean);
}

/**
 * A site is a hand-maintained list. `lists(text)` returns one entry per
 * occurrence of the list in the file, `{ where, names, why? }`, and each occurrence
 * must contain exactly the expected names: the registry packages, or
 * `expected(servers)` when a site lists something else.
 */
export const INVENTORY_SITES = [
  ...["cloudbuild.yaml", "cloudbuild-manual.yaml"].map((file) => ({
    file,
    expected: deployablePackages,
    why: "Cloud Build does not record the server's images (the steps read the registry; images: is static)",
    lists: (t) => {
      const images = t.slice(Math.max(0, t.search(/^images:/m)));
      return [
        {
          where: "images: ':${SHORT_SHA}' entries",
          names: captures(images, /\/([a-z0-9-]+-mcp):\$\{SHORT_SHA\}'/g),
        },
        {
          where: "images: ':${_ENVIRONMENT}-latest' entries",
          names: captures(images, /\/([a-z0-9-]+-mcp):\$\{_ENVIRONMENT\}-latest'/g),
        },
      ];
    },
  })),
  {
    file: "terraform/main.tf",
    expected: deployablePackages,
    why: "Terraform has no default MCP_AUTH_MODE for the service, so the for_each module cannot be planned",
    lists: (t) =>
      captures(t, /service_auth_defaults = \{\n([\s\S]*?)^\s+\}/gm).map((b) => ({
        where: "service_auth_defaults keys",
        names: captures(b, /^\s+"([a-z0-9-]+-mcp)"\s+=/gm),
      })),
  },
  {
    file: "terraform/variables.tf",
    expected: deployablePackages,
    why: "the service has no secret mapping, so the for_each module cannot be planned",
    lists: (t) =>
      captures(t, /variable "mcp_secret_env_vars" \{[\s\S]*?default = \{\n([\s\S]*?)^ {2}\}/gm).map(
        (b) => ({
          where: "mcp_secret_env_vars default keys",
          names: captures(b, /^ {4}"([a-z0-9-]+-mcp)" = \{/gm),
        })
      ),
  },
  ...["dev", "prod"].map((env) => ({
    file: `terraform/${env}.tfvars.example`,
    expected: deployablePackages,
    why: "the example tfvars a deployer copies has no image for the server",
    lists: (t) =>
      captures(t, /^mcp_images = \{\n([\s\S]*?)^\}/gm).map((b) => ({
        where: "mcp_images keys",
        names: captures(b, /^\s+"([a-z0-9-]+-mcp)"\s+=/gm),
      })),
  })),
  ...["bug_report.yml", "feature_request.yml", "new_tool_proposal.yml"].map((name) => ({
    file: `.github/ISSUE_TEMPLATE/${name}`,
    why: "reporters cannot pick the server",
    lists: (t) => {
      const options = dropdownOptions(t, "server");
      return options
        ? [{ where: "server dropdown", names: options.flatMap((o) => serverTokens(o)) }]
        : [];
    },
  })),
  {
    file: ".github/ISSUE_TEMPLATE/bug_report.yml",
    why: "reporters cannot pick the auth mode they are using",
    expected: (servers) => [...new Set(servers.flatMap((s) => s.auth?.modes ?? []))],
    lists: (t) => {
      const options = dropdownOptions(t, "auth-mode");
      return options ? [{ where: "auth-mode dropdown (registry auth.modes)", names: options }] : [];
    },
  },
  {
    file: "docs/CROSS_SERVER_CONTRACT.md",
    why: "the server inventory a contributor checks prefixes against is incomplete",
    lists: (t) => [
      {
        where: "Server Inventory table",
        names: captures(t, /^\| ([a-z0-9-]+-mcp) +\|/gm),
      },
    ],
  },
  {
    file: "docs/guides/platform-mapping.md",
    why: "the platform-to-package table is incomplete",
    lists: (t) => [
      {
        where: "Current Platforms table",
        names: captures(
          t.slice(t.indexOf("## Current Platforms"), t.indexOf("## Planned")),
          /^\|[^|\n]+\| `packages\/([a-z0-9-]+-mcp)`/gm
        ),
      },
    ],
  },
];

/**
 * List-agnostic completeness for files where every server should appear
 * equally often: no server may be mentioned on fewer lines than the most
 * common count. A server missing from ANY list in the file, including one no
 * site above is configured for, drops below it. Extra mentions (a usage example
 * naming one server) only raise a count, so they are harmless.
 *
 * Every file in INVENTORY_SITES must appear here: `true` to census it, or the
 * reason it cannot be censused. Those files rely on their configured sites
 * alone, so a list added there needs a site.
 */
export const CENSUS = {
  "cloudbuild.yaml": true,
  "cloudbuild-manual.yaml": true,
  "terraform/main.tf": true,
  "terraform/variables.tf":
    "each server declares a different number of secrets, so per-server line counts legitimately differ",
  "terraform/dev.tfvars.example": true,
  "terraform/prod.tfvars.example": true,
  ".github/ISSUE_TEMPLATE/bug_report.yml":
    "the auth-mode dropdown lists modes, and the Google servers share google-headers",
  ".github/ISSUE_TEMPLATE/feature_request.yml": true,
  ".github/ISSUE_TEMPLATE/new_tool_proposal.yml": true,
  "docs/CROSS_SERVER_CONTRACT.md": "prose mentions each platform a different number of times",
  "docs/guides/platform-mapping.md": true,
};

/** Lines of `text` that mention the server, as `amazon-dsp`, `amazon_dsp` or within `amazon-dsp-mcp`. */
export function mentionCount(text, pkg) {
  const short = pkg.replace(/-mcp$/, "").replaceAll("-", "[-_]");
  const re = new RegExp(`(?<![a-z0-9])${short}(?![a-z0-9])`, "i");
  return text.split("\n").filter((line) => re.test(line)).length;
}

/** Servers mentioned on fewer lines than the most common count in `text`. */
export function censusShortfalls(text, packages) {
  const counts = new Map(packages.map((p) => [p, mentionCount(text, p)]));
  const freq = new Map();
  for (const c of counts.values()) freq.set(c, (freq.get(c) ?? 0) + 1);
  const mode = [...freq.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
  return [...counts].filter(([, c]) => c < mode).map(([pkg, c]) => ({ pkg, count: c, mode }));
}

/**
 * Files that used to carry their own server list and now derive it from
 * registry.json. Each must still read the registry (`reads`), and must not
 * grow a hardcoded list again. `scope` limits the search where a file keeps
 * one deliberately static list (Cloud Build's `images:`, checked above).
 */
export const DERIVED = [
  { file: "scripts/publish-all.sh", reads: "fleet.mjs deployable" },
  { file: "scripts/conformance-test.sh", reads: "scripts/fleet.mjs" },
  { file: "scripts/deploy.sh", reads: "fleet.mjs deployable" },
  { file: "scripts/smoke-test.sh", reads: "fleet.mjs deployable" },
  { file: "scripts/dev-server.sh", reads: "fleet.mjs" },
  {
    file: "cloudbuild.yaml",
    reads: "fleet.mjs deployable",
    scope: (t) => t.slice(0, t.search(/^images:/m)),
  },
  {
    file: "cloudbuild-manual.yaml",
    reads: "fleet.mjs deployable",
    scope: (t) => t.slice(0, t.search(/^images:/m)),
  },
  { file: "Dockerfile", reads: "pnpm fetch" },
  {
    file: "terraform/main.tf",
    reads: "registry.json",
    // The one hand-kept map left here is a site above.
    scope: (t) => t.replace(/service_auth_defaults = \{[\s\S]*?\n {2}\}/, ""),
  },
  { file: "terraform/outputs.tf", reads: "module.mcp_service" },
];

/**
 * Lines of `text` that look like a hand-written server list: one line naming
 * two or more servers, or three consecutive lines each naming one.
 */
export function hardcodedServerLists(text) {
  const lines = text.split("\n");
  const hits = [];
  let run = [];
  lines.forEach((line, i) => {
    const n = serverTokens(line).length;
    if (n >= 2) hits.push(i + 1);
    if (n >= 1) run.push(i + 1);
    else run = [];
    if (run.length === 3) hits.push(run[0]);
  });
  return [...new Set(hits)].sort((a, b) => a - b);
}

/** Workspace server packages: `packages/*-mcp`. */
export function workspaceServers(root) {
  return readdirSync(join(root, "packages"))
    .filter((p) => p.endsWith("-mcp"))
    .sort();
}

export function readRegistry(root) {
  return JSON.parse(readFileSync(join(root, "registry.json"), "utf8"));
}

function diff(expected, actual) {
  const want = new Set(expected);
  const have = new Set(actual);
  return {
    missing: [...want].filter((n) => !have.has(n)).sort(),
    extra: [...have].filter((n) => !want.has(n)).sort(),
  };
}

/** Each server's default port, read from its `port: z.number()…default(N)`. */
function defaultPorts(root, packages, violations) {
  const ports = new Map();
  for (const pkg of packages) {
    const configPath = join(root, "packages", pkg, "src/config/index.ts");
    if (!existsSync(configPath)) continue;
    const m = readFileSync(configPath, "utf8").match(
      /^\s+port: z\.number\(\)[^\n]*\.default\((\d+)\)/m
    );
    if (m) ports.set(pkg, Number(m[1]));
    else violations.push(`packages/${pkg}/src/config/index.ts: no \`port: z.number()…default(N)\``);
  }
  return ports;
}

/**
 * Every violation as a human-readable line. `registry` defaults to the real
 * registry.json; the test passes a modified copy to prove no site is vacuous.
 */
export function checkFleetInventory(root, registry = readRegistry(root)) {
  const violations = [];
  const servers = registry.servers;
  const packages = servers.map((s) => s.package);

  // Two-way: a package missing from the registry is invisible to every
  // registry-driven check (manifests, server.json, runtime tool lists).
  const ws = diff(packages, workspaceServers(root));
  for (const p of ws.extra) {
    violations.push(`registry.json: no entry for workspace package packages/${p}`);
  }
  for (const p of ws.missing) {
    violations.push(`registry.json: lists ${p}, but packages/${p} does not exist`);
  }

  for (const site of INVENTORY_SITES) {
    const path = join(root, site.file);
    if (!existsSync(path)) {
      violations.push(`${site.file}: file not found (moved? update INVENTORY_SITES)`);
      continue;
    }
    const expected = site.expected ? site.expected(servers) : packages;
    const occurrences = site.lists(readFileSync(path, "utf8"));
    if (occurrences.length === 0) {
      violations.push(`${site.file}: no list found (reformatted? update INVENTORY_SITES)`);
      continue;
    }
    for (const { where, names, why = site.why } of occurrences) {
      if (names.length === 0) {
        violations.push(`${site.file} [${where}]: matched but empty (update INVENTORY_SITES)`);
        continue;
      }
      const { missing, extra } = diff(expected, names);
      if (missing.length) {
        violations.push(`${site.file} [${where}]: missing ${missing.join(", ")} — ${why}`);
      }
      const experimental = extra.filter((n) => packages.includes(n));
      const unknown = extra.filter((n) => !packages.includes(n));
      if (experimental.length) {
        violations.push(
          `${site.file} [${where}]: lists ${experimental.join(", ")}, which is not stable (deploy lists cover status "stable" only; \`pnpm promote:server\` adds it)`
        );
      }
      if (unknown.length) {
        violations.push(
          `${site.file} [${where}]: lists ${unknown.join(", ")}, not in registry.json`
        );
      }
    }
  }

  // Census: catches a server missing from a list no site is configured for.
  for (const file of new Set(INVENTORY_SITES.map((s) => s.file))) {
    const decision = CENSUS[file];
    if (decision === undefined) {
      violations.push(`${file}: no CENSUS entry (census it, or record why it cannot be)`);
      continue;
    }
    if (decision !== true || !existsSync(join(root, file))) continue;
    const censused = DEPLOY_SITE_FILES.includes(file) ? deployablePackages(servers) : packages;
    for (const { pkg, count, mode } of censusShortfalls(
      readFileSync(join(root, file), "utf8"),
      censused
    )) {
      violations.push(
        `${file}: mentions ${pkg} on ${count} line(s), but most servers on ${mode} — it is missing from a list in this file`
      );
    }
  }
  for (const file of Object.keys(CENSUS)) {
    if (!INVENTORY_SITES.some((s) => s.file === file)) {
      violations.push(`CENSUS lists ${file}, which has no inventory site`);
    }
  }

  // Terraform's default auth mode for each service must be one the server supports.
  const mainTf = readFileSync(join(root, "terraform/main.tf"), "utf8");
  const authBlock = mainTf.match(/service_auth_defaults = \{\n([\s\S]*?)^\s+\}/m)?.[1] ?? "";
  for (const [, pkg, mode] of authBlock.matchAll(/^\s+"([a-z0-9-]+-mcp)"\s+= "([^"]+)"/gm)) {
    const modes = servers.find((s) => s.package === pkg)?.auth?.modes;
    if (modes && !modes.includes(mode)) {
      violations.push(
        `terraform/main.tf service_auth_defaults: ${pkg} defaults to "${mode}", not in its registry auth.modes`
      );
    }
  }

  // Registry fields the derived lists rely on.
  const ports = defaultPorts(root, packages, violations);
  const portOwner = new Map();
  const prefixOwner = new Map();
  for (const server of servers) {
    const { package: pkg, port, tool_prefix: prefix } = server;
    if (!Number.isInteger(port)) {
      violations.push(`registry.json ${pkg}: no integer \`port\``);
    } else {
      if (portOwner.has(port)) {
        violations.push(
          `registry.json: port ${port} is used by both ${portOwner.get(port)} and ${pkg}`
        );
      }
      portOwner.set(port, pkg);
      if (ports.has(pkg) && ports.get(pkg) !== port) {
        violations.push(
          `registry.json ${pkg}: port ${port}, but packages/${pkg}/src/config/index.ts defaults to ${ports.get(pkg)}`
        );
      }
    }
    if (typeof prefix !== "string" || !/^[a-z0-9_]+$/.test(prefix)) {
      violations.push(`registry.json ${pkg}: \`tool_prefix\` must match /^[a-z0-9_]+$/`);
      continue;
    }
    if (prefixOwner.has(prefix)) {
      violations.push(
        `registry.json: tool_prefix "${prefix}" is used by both ${prefixOwner.get(prefix)} and ${pkg}`
      );
    }
    prefixOwner.set(prefix, pkg);
    const derived = server.tools?.length ? derivePrefix(server.tools) : null;
    if (derived && derived !== prefix) {
      violations.push(
        `registry.json ${pkg}: tool_prefix "${prefix}", but its tools share "${derived}"`
      );
    }
  }

  // Derived files: still reading the registry, and no hand-written list again.
  for (const { file, reads, scope = (t) => t } of DERIVED) {
    const path = join(root, file);
    if (!existsSync(path)) {
      violations.push(`${file}: file not found (moved? update DERIVED)`);
      continue;
    }
    const text = readFileSync(path, "utf8");
    if (!text.includes(reads)) {
      violations.push(`${file}: no longer reads the registry (expected "${reads}")`);
    }
    const lines = hardcodedServerLists(scope(text));
    if (lines.length) {
      violations.push(
        `${file}: hardcoded server list at line(s) ${lines.join(", ")}; derive it from registry.json instead`
      );
    }
  }

  return violations;
}

// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// `pnpm new:server`: plan every file a new server needs, then write them.
//
// planScaffold reads the repo and returns the full set of writes without
// touching disk, and every check runs before anything is written, so a bad
// key, a taken port or a moved anchor leaves the tree as it was. Output is
// formatted with the repo's prettier config in memory, so the files written
// are the files CI's format:check sees, and the platform-facts codeRefs are
// computed from the formatted config.

import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import * as prettier from "prettier";
import {
  KEY_PATTERN,
  buildPlatformFacts,
  buildRegistryEntry,
  names,
  nextFreePort,
} from "./entries.mjs";
import { TEMPLATE_DIR, TEMPLATE_TOOLS, renderTemplate } from "./render.mjs";
import { insertIntoSites, insertReadmeRow } from "./sites.mjs";

const REPO_ROOT = join(import.meta.dirname, "../..");

/** Extensions CI's `format:check` covers; other files keep their own style. */
const PRETTIER_EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|json|md)$/;

/** Invalid input: the CLI prints the message and exits 2. */
export class ScaffoldError extends Error {}

const SUPPORTED_TYPES = ["management"];

function validate(opts, registry, root) {
  if (!KEY_PATTERN.test(opts.key ?? "")) {
    throw new ScaffoldError(
      `platform key "${opts.key}" must match ${KEY_PATTERN} (lower snake case, e.g. reddit or amazon_dsp)`
    );
  }
  if (!SUPPORTED_TYPES.includes(opts.type)) {
    throw new ScaffoldError(
      `--type ${opts.type} is not supported yet; only management servers can be scaffolded. ` +
        "Reporting templates follow in PR 3 of the new-server work."
    );
  }
  if (!opts.displayName) throw new ScaffoldError("--display-name is required");
  for (const flag of ["baseUrl", "docsUrl"]) {
    try {
      new URL(opts[flag]);
    } catch {
      throw new ScaffoldError(`--${flag === "baseUrl" ? "base-url" : "docs-url"} must be a URL`);
    }
  }
  if (!Number.isInteger(opts.rateLimitPerMinute) || opts.rateLimitPerMinute < 1) {
    throw new ScaffoldError("--rate-limit must be a positive integer (requests per minute)");
  }

  const n = names(opts.key);
  for (const s of registry.servers) {
    for (const [field, value] of [
      ["platform_key", s.platform_key],
      ["tool_prefix", s.tool_prefix],
    ]) {
      if (value === n.key) {
        throw new ScaffoldError(`platform_key "${n.key}" is taken: it is ${s.package}'s ${field}`);
      }
    }
    if (s.package === n.package)
      throw new ScaffoldError(`${n.package} is already in registry.json`);
  }
  const port = opts.port ?? nextFreePort(registry);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new ScaffoldError(`--port must be an integer from 1024 to 65535, got ${opts.port}`);
  }
  const owner = registry.servers.find((s) => s.port === port);
  if (owner) throw new ScaffoldError(`port ${port} is taken by ${owner.package}`);
  if (existsSync(join(root, "packages", n.package))) {
    throw new ScaffoldError(`packages/${n.package} already exists; nothing was written`);
  }
  return { n, port };
}

/** Insert `items` (JSON-serialisable) at the end of the top-level array closed by the file's last `\n  ]`. */
function appendToJsonArray(text, file, items) {
  const close = text.lastIndexOf("\n  ]");
  if (close < 0) throw new ScaffoldError(`${file}: cannot find the array to append to`);
  const body = items
    .map((item) =>
      JSON.stringify(item, null, 2)
        .split("\n")
        .map((l) => `    ${l}`)
        .join("\n")
    )
    .join(",\n");
  return `${text.slice(0, close)},\n${body}${text.slice(close)}`;
}

const FACTS_DOC = "docs/architecture/platform-facts-ledger.md";

/**
 * Restate the ledger's size in its doc, which
 * scripts/__tests__/check-platform-facts.test.mjs holds to the real count.
 */
function recountFactsDoc(text, facts) {
  const count = (pred) => facts.filter(pred).length;
  const counts = [
    [/— \d+ facts:/, `— ${facts.length} facts:`],
    [
      /the \d+ versioned and unversioned API base URLs/,
      `the ${count((f) => /-base-url$/.test(f.class))} versioned and unversioned API base URLs`,
    ],
    [
      /\(\d+ `<platform>\.rate_limit_default` facts/,
      `(${count((f) => f.id.endsWith(".rate_limit_default"))} \`<platform>.rate_limit_default\` facts`,
    ],
  ];
  return counts.reduce((t, [re, value]) => {
    if (!re.test(t)) throw new ScaffoldError(`${FACTS_DOC}: cannot find ${re} to update`);
    return t.replace(re, value);
  }, text);
}

/** 1-based line of the first line in `text` that `test` accepts. */
function lineOf(text, test, what) {
  const i = text.split("\n").findIndex(test);
  if (i < 0) throw new Error(`template config: cannot find the ${what} line`);
  return i + 1;
}

/** Format each ts/js/json/md file with the repo's prettier config, in memory. */
export async function format(writes) {
  const config = (await prettier.resolveConfig(join(REPO_ROOT, "package.json"))) ?? {};
  const out = new Map();
  for (const [path, text] of writes) {
    out.set(
      path,
      PRETTIER_EXTENSIONS.test(path)
        ? await prettier.format(text, { ...config, filepath: path })
        : text
    );
  }
  return out;
}

/**
 * Every write a new server needs, without writing any of them.
 * Returns `{ writes: Map<repo-relative path, text>, created, modified }`.
 */
export async function planScaffold(root, opts, today) {
  const read = (p) => readFileSync(join(root, p), "utf8");
  const registryText = read("registry.json");
  const registry = JSON.parse(registryText);
  const { n, port } = validate(opts, registry, root);
  const full = { ...opts, port };

  const pkgDir = `packages/${n.package}`;
  const rendered = renderTemplate(
    join(TEMPLATE_DIR, opts.type),
    {
      ...n,
      displayName: opts.displayName,
      port: String(port),
      baseUrl: opts.baseUrl,
      docsUrl: opts.docsUrl,
      rateLimitPerMinute: String(opts.rateLimitPerMinute),
    },
    { writes: Boolean(opts.writes) }
  );
  const created = await format(new Map([...rendered].map(([p, t]) => [`${pkgDir}/${p}`, t])));

  const config = created.get(`${pkgDir}/src/config/index.ts`);
  const configLines = {
    baseUrl: lineOf(config, (l) => l.includes(`.default("${opts.baseUrl}")`), "API base URL"),
    rateLimit: lineOf(
      config,
      (l) => l.includes(`.default(${opts.rateLimitPerMinute})`) && l.includes("rateLimitPerMinute"),
      "rate-limit default"
    ),
  };

  const tools = TEMPLATE_TOOLS(n.key, { writes: Boolean(opts.writes) });
  const facts = buildPlatformFacts(full, today, configLines);
  const site = {
    ...n,
    displayName: opts.displayName,
    authMode: `${n.key}-bearer`,
    secretEnvVars: {
      MCP_AUTH_SECRET_KEY: { secret_name: "cesteral-jwt-secret-key", version: "latest" },
    },
  };
  const modified = new Map([
    [
      "registry.json",
      appendToJsonArray(registryText, "registry.json", [buildRegistryEntry(full, registry, tools)]),
    ],
    [
      "platform-facts.json",
      appendToJsonArray(read("platform-facts.json"), "platform-facts.json", facts),
    ],
    [
      FACTS_DOC,
      recountFactsDoc(read(FACTS_DOC), [
        ...JSON.parse(read("platform-facts.json")).facts,
        ...facts,
      ]),
    ],
    [
      "README.md",
      insertReadmeRow(read("README.md"), {
        ...site,
        displayName: `${opts.displayName} API`,
        toolCount: tools.length,
        authLabel: "Bearer token",
      }),
    ],
    // Experimental: the deploy lists wait for `pnpm promote:server`.
    ...insertIntoSites(read, site, { deploy: false }),
  ]);
  const formatted = await format(modified);

  // Every package links the root licence; publish refuses a tarball without it.
  const links = new Map([[`${pkgDir}/LICENSE.md`, "../../LICENSE.md"]]);

  return {
    writes: new Map([...created, ...formatted]),
    links,
    created: [...created.keys(), ...links.keys()],
    modified: [...formatted.keys()],
  };
}

/** Write a plan from planScaffold. */
export function applyPlan(root, plan) {
  for (const [path, text] of plan.writes) {
    const abs = join(root, path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, text);
  }
  for (const [path, target] of plan.links ?? []) symlinkSync(target, join(root, path));
}

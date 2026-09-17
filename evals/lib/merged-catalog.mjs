// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// The merged `tools/list` — the thing a Layer 2 client actually sees (#205 Part 2).
//
// Layer 1 (`tool-search.ts`, pinned by tool-search-ranking.test.mjs) searches ONE
// server's own registry. A real client does not: it connects several servers and
// hands its model the union of their tool lists. That union is where cross-server
// confusion lives, and building it is the first thing Part 2 needs.
//
// WHY THE PLATFORM PREFIX IS LOAD-BEARING
//
// 248 of the fleet's 314 tools (79%) sit on an operation suffix shared with at
// least one other server — `delete_entity` exists on ten servers, `get_entity` on
// twelve. Once merged, the ONLY thing distinguishing `meta_delete_entity` from
// `tiktok_delete_entity` for most of the catalog is the platform prefix on the
// name. Descriptions do not reliably carry it: 54 of those 248 never name their
// own platform, and all ten `*_search_tools` descriptions are byte-identical.
//
// That is why `assertPrefixInvariant` is a ratchet and not a report. An unprefixed
// tool name would remove the disambiguator the whole layer rests on.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, withServerClient, listRawTools } from "../../scripts/lib/boot-server.mjs";

/** Every built MCP server package, in a stable order. */
export function serverPackages() {
  return readdirSync(join(ROOT, "packages"))
    .filter((p) => p.endsWith("-mcp"))
    .sort();
}

/**
 * The platform prefix for a server, derived from the tools it actually
 * advertises rather than declared anywhere.
 *
 * Deriving it means a server that renamed its tools cannot keep a stale
 * declaration; `assertPrefixInvariant` then checks the derived value against
 * registry.json, so the two must agree.
 */
export function derivePrefix(toolNames) {
  if (toolNames.length === 0) return null;
  const parts = toolNames.map((n) => n.split("_"));
  let prefix = [];
  for (let i = 0; i < parts[0].length - 1; i++) {
    const seg = parts[0][i];
    if (!parts.every((p) => p.length > i + 1 && p[i] === seg)) break;
    prefix.push(seg);
  }
  return prefix.length > 0 ? prefix.join("_") : null;
}

/**
 * Boot every requested server and return the merged catalog: the raw wire tool
 * objects a client would receive, each tagged with the server it came from.
 *
 * `inputSchema` is kept. A client's model sees it, and the routing eval hands
 * the model the real thing rather than a trimmed summary of it — 314 tools with
 * schemas is ~128k tokens, which fits one cached request.
 */
export async function buildMergedCatalog(packages = serverPackages()) {
  const servers = [];
  for (const pkg of packages) {
    const tools = await withServerClient(pkg, (client) => listRawTools(client));
    servers.push({
      package: pkg,
      prefix: derivePrefix(tools.map((t) => t.name)),
      tools: tools.map((t) => ({
        server: pkg,
        name: t.name,
        title: t.title,
        description: t.description,
        inputSchema: t.inputSchema,
        annotations: t.annotations,
      })),
    });
  }
  const tools = servers.flatMap((s) => s.tools);
  return {
    servers,
    tools,
    byName: new Map(tools.map((t) => [t.name, t])),
    serverOf: (toolName) => tools.find((t) => t.name === toolName)?.server ?? null,
  };
}

/** Registry-declared platform prefixes, keyed by package. */
export function registryPrefixes() {
  const out = new Map();
  for (const server of readRegistry().servers) {
    out.set(server.package, derivePrefix(server.tools ?? []));
  }
  return out;
}

function readRegistry() {
  return JSON.parse(readFileSync(join(ROOT, "registry.json"), "utf-8"));
}

/**
 * Every name a server's own text might plausibly use for its platform.
 *
 * Derived from registry.json rather than from the tool-name prefix, because the
 * prefix is an abbreviation and the prose is not: `msads_delete_entity` says
 * "Microsoft Advertising", `gads_create_entity` says "Google Ads". Keying the
 * self-identification check on the prefix alone reported 25 tools as anonymous
 * when the true figure is 2 — the abbreviation simply never appears in prose.
 */
export function platformAliases() {
  const out = new Map();
  for (const server of readRegistry().servers) {
    const prefix = derivePrefix(server.tools ?? []);
    const aliases = new Set();
    for (const value of [server.platform, server.platform_display_name, prefix]) {
      if (!value) continue;
      aliases.add(value.toLowerCase());
      // "Google Bid Manager (DV360)" also identifies itself as "DV360".
      for (const inner of value.matchAll(/\(([^)]+)\)/g)) aliases.add(inner[1].toLowerCase());
      aliases.add(value.toLowerCase().replace(/\s*\([^)]*\)\s*/g, "").trim());
    }
    out.set(server.package, [...aliases].filter(Boolean));
  }
  return out;
}

/**
 * The invariant Layer 2 rests on: every tool name is namespaced by its server's
 * platform, and no two servers share a prefix.
 *
 * Returns a list of violations rather than throwing, so the caller decides
 * whether it is a ratchet failure or a report line.
 */
export function assertPrefixInvariant(catalog) {
  const violations = [];
  const seenPrefix = new Map();
  const declared = registryPrefixes();

  for (const server of catalog.servers) {
    if (!server.prefix) {
      violations.push(`${server.package}: no common platform prefix across its tool names`);
      continue;
    }
    const owner = seenPrefix.get(server.prefix);
    if (owner) {
      violations.push(`prefix "${server.prefix}" is claimed by both ${owner} and ${server.package}`);
    }
    seenPrefix.set(server.prefix, server.package);

    const fromRegistry = declared.get(server.package);
    if (fromRegistry && fromRegistry !== server.prefix) {
      violations.push(
        `${server.package}: runtime prefix "${server.prefix}" disagrees with registry.json "${fromRegistry}"`
      );
    }
    for (const tool of server.tools) {
      if (!tool.name.startsWith(`${server.prefix}_`)) {
        violations.push(
          `${tool.name} (${server.package}) does not carry its platform prefix "${server.prefix}_". ` +
            `Merged into a client's tool list this tool has nothing distinguishing it from the ` +
            `same operation on another platform — see evals/lib/merged-catalog.mjs.`
        );
      }
    }
  }
  return violations;
}

/**
 * Operation families: tools sharing a suffix once the platform prefix is removed.
 *
 * This is the confusion surface, measured rather than assumed. Each family is a
 * set of near-identical tools a model must tell apart using the prefix, the
 * title, and whatever platform detail the description happens to carry.
 */
export function operationFamilies(catalog) {
  const families = new Map();
  for (const server of catalog.servers) {
    if (!server.prefix) continue;
    for (const tool of server.tools) {
      const suffix = tool.name.startsWith(`${server.prefix}_`)
        ? tool.name.slice(server.prefix.length + 1)
        : tool.name;
      if (!families.has(suffix)) families.set(suffix, []);
      families.get(suffix).push({ ...tool, prefix: server.prefix, suffix });
    }
  }
  return families;
}

/**
 * Tools in a shared family whose own text never names their platform.
 *
 * These are the hardest for a model: strip the prefix and nothing it reads says
 * which platform the tool drives, so the name is the sole disambiguator.
 * Counted so the number cannot quietly grow.
 */
export function toolsWithoutSelfIdentifyingDescription(catalog) {
  const aliases = platformAliases();
  const out = [];
  for (const [, tools] of operationFamilies(catalog)) {
    if (tools.length < 2) continue;
    for (const tool of tools) {
      const haystack = squash(`${tool.description ?? ""} ${tool.title ?? ""}`);
      const needles = (aliases.get(tool.server) ?? [tool.prefix]).map(squash);
      if (!needles.some((n) => n && haystack.includes(n))) out.push(tool.name);
    }
  }
  return out.sort();
}

/**
 * Strip everything but letters and digits before comparing.
 *
 * Amazon DSP's tools spell the platform "AmazonDsp Ads" — one word, a codegen
 * artifact rather than the product's name — while registry.json declares
 * "Amazon DSP". Comparing raw strings called five correctly self-identifying
 * tools anonymous. The spelling is left alone deliberately: editing those
 * descriptions would change their definitionHash and force re-attestation of
 * five governed tools to fix a cosmetic inconsistency.
 */
function squash(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

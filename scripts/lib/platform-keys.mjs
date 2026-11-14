// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// One platform key per server (#273 decisions 1-3).
//
// A server's platform used to be spelled up to seven ways (tool prefix,
// cesteral.platform, contractPlatformSlug, telemetry platform, span and
// rate-limit keys, reporting enum, platform-facts ids), with no rule. The
// governed identifiers are frozen: contractPlatformSlug keys governance write
// admission and cesteral.platform sits inside definitionHash, so renaming
// either would stop or re-admit every governed write. The rule is therefore:
//
//   - registry `platform_key` IS the server's contractPlatformSlug, and every
//     governed tool must carry it.
//   - cesteral.platform equals platform_key.
//   - platform_key equals the tool prefix.
//
// The servers that predate the rule and differ are listed below with the
// reason. Both lists may only shrink: an entry whose mismatch is gone fails.
// A new server gets no entry, so it has one key everywhere.

/** Servers whose platform_key differs from their tool prefix (frozen contract slugs). */
export const KEY_DIFFERS_FROM_PREFIX = {
  "gads-mcp": "contract slug `google_ads` predates the rule; tools use the `gads` prefix",
  "linkedin-mcp": "contract slug `linkedin_ads` predates the rule; tools use the `linkedin` prefix",
};

/** Servers whose governed tools' cesteral.platform differs from platform_key. */
export const ANNOTATION_PLATFORM_DIFFERS = {
  "meta-mcp": {
    value: "meta_ads",
    why: "annotation value predates the rule and is inside every governed definitionHash",
  },
};

import { meets } from "./contract-tiers.mjs";

const KEY_PATTERN = /^[a-z0-9_]{1,40}$/;

/** Registry-level rules: key format, uniqueness, key = prefix, no stale legacy entries. */
export function checkRegistryKeys(registry) {
  const violations = [];
  const owners = new Map();
  for (const { package: pkg, platform_key: key, tool_prefix: prefix } of registry.servers) {
    if (typeof key !== "string" || !KEY_PATTERN.test(key)) {
      violations.push(`${pkg}: registry \`platform_key\` must match ${KEY_PATTERN}`);
      continue;
    }
    if (owners.has(key)) {
      violations.push(`platform_key "${key}" is used by both ${owners.get(key)} and ${pkg}`);
    }
    owners.set(key, pkg);
    if (key !== prefix && !KEY_DIFFERS_FROM_PREFIX[pkg]) {
      violations.push(
        `${pkg}: platform_key "${key}" must equal tool_prefix "${prefix}" (one key everywhere)`
      );
    }
    if (key === prefix && KEY_DIFFERS_FROM_PREFIX[pkg]) {
      violations.push(`${pkg}: KEY_DIFFERS_FROM_PREFIX entry is no longer needed; remove it`);
    }
  }
  for (const pkg of [
    ...Object.keys(KEY_DIFFERS_FROM_PREFIX),
    ...Object.keys(ANNOTATION_PLATFORM_DIFFERS),
  ]) {
    if (!registry.servers.some((s) => s.package === pkg)) {
      violations.push(`legacy entry for ${pkg}, which is not in registry.json`);
    }
  }
  return violations;
}

/**
 * Per-server rule: every governed tool (from the server's real tools/list)
 * carries the server's platform_key as contractPlatformSlug and
 * cesteral.platform.
 */
export function checkGovernedTools(server, tools) {
  const { package: pkg, platform_key: key } = server;
  const violations = [];
  const legacy = ANNOTATION_PLATFORM_DIFFERS[pkg];
  let legacyUsed = false;
  for (const tool of tools.filter((t) => t.annotations?.cesteral)) {
    const c = tool.annotations.cesteral;
    if (c.contractPlatformSlug !== key) {
      violations.push(
        `${tool.name}: contractPlatformSlug "${c.contractPlatformSlug}" must equal ${pkg}'s platform_key "${key}"`
      );
    }
    if (c.platform === key) continue;
    if (legacy && c.platform === legacy.value) {
      legacyUsed = true;
      continue;
    }
    violations.push(
      `${tool.name}: cesteral.platform "${c.platform}" must equal ${pkg}'s platform_key "${key}"`
    );
  }
  if (legacy && !legacyUsed) {
    violations.push(`${pkg}: ANNOTATION_PLATFORM_DIFFERS entry is no longer needed; remove it`);
  }
  return violations;
}

/**
 * The names outside definitionHash also use the key (#273 decision 4): each
 * server's telemetry `platform` (the `mcp.platform` span attribute and the
 * interaction-log `platform` field) and the shared reporting enums, which list
 * the key of every server with a reporting tool. Read from
 * source, since neither is on the MCP wire.
 */
export function checkPlatformNames(registry, readSource) {
  const violations = [];
  for (const { package: pkg, platform_key: key } of registry.servers) {
    const path = `packages/${pkg}/src/mcp-server/server.ts`;
    const text = readSource(path);
    const passed = text.match(/^\s+platform: ([A-Z0-9_]+),$/m)?.[1];
    const value = passed && text.match(new RegExp(`const ${passed} = "([^"]+)";`))?.[1];
    if (!value) {
      violations.push(`${path}: no \`platform: <CONST>\` with a string const to check`);
    } else if (value !== key) {
      violations.push(`${path}: telemetry platform "${value}" must equal platform_key "${key}"`);
    }
  }
  // Only servers that ship a reporting tool appear in the reporting enums
  // (dv360's reporting is dbm-mcp).
  const keys = registry.servers
    .filter((s) => meets(s, "reporting"))
    .map((s) => s.platform_key)
    .sort();
  const enums = [
    {
      path: "packages/shared/src/utils/reporting/report-errors.ts",
      block: /export type ReportingPlatform =([^;]+);/,
    },
    {
      path: "packages/shared/src/schemas/report-schedule.ts",
      block: /platform: z\.enum\(\[([^\]]+)\]\)/,
    },
  ];
  for (const { path, block } of enums) {
    const body = readSource(path).match(block)?.[1];
    if (!body) {
      violations.push(`${path}: reporting platform enum not found (moved? update this check)`);
      continue;
    }
    const values = [...body.matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort();
    if (JSON.stringify(values) !== JSON.stringify(keys)) {
      violations.push(
        `${path}: reporting platforms ${JSON.stringify(values)} must equal the platform_keys of the servers that ship a reporting tool ${JSON.stringify(keys)}`
      );
    }
  }
  return violations;
}

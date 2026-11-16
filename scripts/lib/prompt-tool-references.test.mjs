// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// Ratchet (#235): prompts and resources may only name tools that exist.
//
// Prompt and resource text is guidance a model follows literally. When it
// names a tool no server registers, the model either calls a tool that does
// not exist or concludes the capability is missing. The fleet shipped:
//   - amazon-dsp's whole targeting-discovery prompt built on
//     amazon_dsp_search_targeting / _get_targeting_options /
//     _get_audience_estimate, none of them registered (the prompt was a TikTok
//     copy);
//   - pinterest_get_audience_estimate for pinterest_get_delivery_estimate, and
//     pinterest_list_advertisers for pinterest_list_ad_accounts;
//   - snapchat_upload_media in the cross-platform prompt on 10 servers, for
//     snapchat_upload_image / snapchat_upload_video.
// Nothing checked it: check:registry-runtime compares tool names, not the text
// that talks about them.
//
// This boots every built server, collects the merged fleet tools/list and
// prompts/list, renders every prompt (required args filled with a
// placeholder) and reads every listed resource, then requires every
// `{platform prefix}_{name}` token in that text to be a registered tool or a
// prompt name somewhere in the fleet. Cross-platform prompts may name other
// servers' tools; the set is fleet-wide for that reason.

import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./boot-server.mjs";
import { serverSnapshot } from "./fleet-snapshot-inject.mjs";
import { registryPrefixes } from "../../evals/lib/merged-catalog.mjs";

const packages = readdirSync(join(ROOT, "packages"))
  .filter((p) => p.endsWith("-mcp"))
  .sort();

/**
 * Tool-name prefixes in use, derived from registry.json so a new server's
 * prompts are checked from its first commit. The prefix invariant itself is
 * ratcheted in evals/lib/merged-catalog.mjs.
 */
export const TOOL_PREFIXES = [...registryPrefixes().values()].filter(Boolean).sort();

const TOOL_TOKEN = new RegExp(`\\b(?:${TOOL_PREFIXES.join("|")})_[a-z0-9_]+\\b`, "g");

/**
 * Platform API field names that happen to start with a platform prefix. They are
 * real request fields, not tool references, and cannot be renamed. An entry
 * here must be a field the platform's own API defines; a tool name never
 * belongs in it (the unit test below pins that).
 */
export const PLATFORM_FIELD_TOKENS = new Map([
  ["snapchat_positions", "field of the ad squad `placement_v2` object in Snap's Ads API (#233)"],
]);

/** Tool-shaped tokens in `text` that are neither a known tool nor a known prompt. */
export function unknownToolReferences(text, knownNames) {
  const unknown = new Set();
  for (const match of text.matchAll(TOOL_TOKEN)) {
    if (!knownNames.has(match[0]) && !PLATFORM_FIELD_TOKENS.has(match[0])) unknown.add(match[0]);
  }
  return [...unknown].sort();
}

describe("unknownToolReferences", () => {
  const known = new Set(["pinterest_get_delivery_estimate", "snapchat_upload_image"]);

  it("flags a prefixed name that is not registered", () => {
    expect(
      unknownToolReferences(
        "call `pinterest_get_audience_estimate` then snapchat_upload_image",
        known
      )
    ).toEqual(["pinterest_get_audience_estimate"]);
  });

  it("ignores a listed platform API field but still flags a tool-shaped look-alike", () => {
    expect(unknownToolReferences("set snapchat_positions in placement_v2", known)).toEqual([]);
    expect(unknownToolReferences("call snapchat_get_positions", known)).toEqual([
      "snapchat_get_positions",
    ]);
  });

  it("never lists a registered tool name as a platform field", () => {
    const { names } = collectFleet();
    for (const token of PLATFORM_FIELD_TOKENS.keys()) {
      expect(names.has(token), `${token} is a tool; remove it from PLATFORM_FIELD_TOKENS`).toBe(
        false
      );
    }
  });

  it("ignores unprefixed words, env vars and registered names", () => {
    expect(
      unknownToolReferences("use pinterest_get_delivery_estimate; set TTD_USE_SANDBOX", known)
    ).toEqual([]);
  });
});

/** Everything the fleet publishes that a prompt or resource may refer to. */
function collectFleet() {
  const names = new Set();
  const texts = [];
  for (const pkg of packages) {
    const { tools, prompts, resources } = serverSnapshot(pkg);
    for (const tool of tools) names.add(tool.name);
    for (const { prompt, renders } of prompts) {
      names.add(prompt.name);
      for (const { text } of renders) texts.push({ pkg, where: `prompt ${prompt.name}`, text });
    }
    for (const { uri, text } of resources) texts.push({ pkg, where: `resource ${uri}`, text });
  }
  return { names, texts };
}

describe("prompts and resources name only registered tools", () => {
  it("every {prefix}_* token in fleet prompt and resource text is a tool or prompt", () => {
    const { names, texts } = collectFleet();
    expect(texts.length).toBeGreaterThan(0);

    const problems = [];
    for (const { pkg, where, text } of texts) {
      const unknown = unknownToolReferences(text, names);
      if (unknown.length > 0) problems.push(`${pkg} ${where}: ${unknown.join(", ")}`);
    }
    expect(problems).toEqual([]);
  });
});

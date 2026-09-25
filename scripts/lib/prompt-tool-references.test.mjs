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
import { withServerClient, listRawTools, ROOT } from "./boot-server.mjs";

const packages = readdirSync(join(ROOT, "packages"))
  .filter((p) => p.endsWith("-mcp"))
  .sort();

/** Tool-name prefixes in use. The prefix invariant is ratcheted in evals/lib/merged-catalog.mjs. */
export const TOOL_PREFIXES = [
  "amazon_dsp",
  "cm360",
  "dbm",
  "dv360",
  "gads",
  "linkedin",
  "meta",
  "msads",
  "pinterest",
  "sa360",
  "snapchat",
  "tiktok",
  "ttd",
];

const TOOL_TOKEN = new RegExp(`\\b(?:${TOOL_PREFIXES.join("|")})_[a-z0-9_]+\\b`, "g");

const IDENTITY_SCHEMA = {
  parse: (value) => value,
  safeParse: (value) => ({ success: true, data: value }),
};

/** Tool-shaped tokens in `text` that are neither a known tool nor a known prompt. */
export function unknownToolReferences(text, knownNames) {
  const unknown = new Set();
  for (const match of text.matchAll(TOOL_TOKEN)) {
    if (!knownNames.has(match[0])) unknown.add(match[0]);
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

  it("ignores unprefixed words, env vars and registered names", () => {
    expect(
      unknownToolReferences("use pinterest_get_delivery_estimate; set TTD_USE_SANDBOX", known)
    ).toEqual([]);
  });
});

/** Everything the fleet publishes that a prompt or resource may refer to. */
async function collectFleet() {
  const names = new Set();
  const texts = [];
  for (const pkg of packages) {
    await withServerClient(pkg, async (client) => {
      for (const tool of await listRawTools(client)) names.add(tool.name);
      const caps = client.getServerCapabilities() ?? {};

      if (caps.prompts) {
        const { prompts } = await client.request(
          { method: "prompts/list", params: {} },
          IDENTITY_SCHEMA
        );
        for (const prompt of prompts) {
          names.add(prompt.name);
          const args = {};
          for (const arg of prompt.arguments ?? []) if (arg.required) args[arg.name] = "x";
          const result = await client.request(
            { method: "prompts/get", params: { name: prompt.name, arguments: args } },
            IDENTITY_SCHEMA
          );
          const text = (result.messages ?? []).map((m) => m.content?.text ?? "").join("\n");
          texts.push({ pkg, where: `prompt ${prompt.name}`, text });
        }
      }

      if (caps.resources) {
        const { resources } = await client.request(
          { method: "resources/list", params: {} },
          IDENTITY_SCHEMA
        );
        for (const resource of resources) {
          const result = await client.request(
            { method: "resources/read", params: { uri: resource.uri } },
            IDENTITY_SCHEMA
          );
          const text = (result.contents ?? []).map((c) => c.text ?? "").join("\n");
          texts.push({ pkg, where: `resource ${resource.uri}`, text });
        }
      }
    });
  }
  return { names, texts };
}

describe("prompts and resources name only registered tools", () => {
  it("every {prefix}_* token in fleet prompt and resource text is a tool or prompt", async () => {
    const { names, texts } = await collectFleet();
    expect(texts.length).toBeGreaterThan(0);

    const problems = [];
    for (const { pkg, where, text } of texts) {
      const unknown = unknownToolReferences(text, names);
      if (unknown.length > 0) problems.push(`${pkg} ${where}: ${unknown.join(", ")}`);
    }
    expect(problems).toEqual([]);
  }, 120_000);
});

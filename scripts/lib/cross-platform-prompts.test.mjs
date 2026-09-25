// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// Ratchet (#235): the cross-platform prompts have ONE source.
//
// `cross_platform_campaign_setup` and `cross_platform_performance_comparison`
// describe the whole fleet, yet were copy-pasted into 12 servers (msads-mcp
// had neither) and drifted into 6 variants of each: 9 copies said
// TTD/LinkedIn/TikTok/Amazon DSP budgets were "in dollars", amazon-dsp's said
// "account currency", cm360's and sa360's said LinkedIn budgets were cents, and three copies had rewritten the DV360/TTD
// example parameters to their own ID names (`profileId`, `adAccountId`). A
// client asking the same prompt of two servers got two different answers
// about money units.
//
// They now live in @cesteral/shared (utils/cross-platform-prompts.ts). This
// suite keeps it that way, over the wire:
//   1. every server that registers either prompt publishes metadata and
//      renders text byte-identical to the shared module, for the same args;
//   2. no package source outside shared defines either prompt's name, so a
//      new local copy fails here even before it drifts;
//   3. every server in the fleet registers both.
// Nothing is per-server: the text describes the fleet, so there is no
// documented per-server parameter to exempt.

import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { withServerClient, ROOT } from "./boot-server.mjs";

const sharedModule = join(ROOT, "packages", "shared", "dist", "utils", "cross-platform-prompts.js");
if (!existsSync(sharedModule)) {
  throw new Error(`${sharedModule} not found. Build @cesteral/shared before this suite.`);
}
const { CROSS_PLATFORM_PROMPTS } = await import(pathToFileURL(sharedModule).href);

const PROMPT_NAMES = CROSS_PLATFORM_PROMPTS.map((p) => p.prompt.name);

/**
 * Every server registers both prompts (msads-mcp since #235). Required, so
 * dropping them from a server is a reviewed change rather than a silent one.
 */
/** Argument sets each prompt is rendered with: none, and every argument set. */
const ARG_SETS = {
  cross_platform_campaign_setup: [
    {},
    { totalBudget: "50000", objective: "awareness", currency: "EUR" },
  ],
  cross_platform_performance_comparison: [
    {},
    { dateRange: "LAST_30_DAYS" },
    { dateRange: "2026-03-01 to 2026-03-31" },
  ],
};

const IDENTITY_SCHEMA = {
  parse: (value) => value,
  safeParse: (value) => ({ success: true, data: value }),
};

const packages = readdirSync(join(ROOT, "packages"))
  .filter((p) => p.endsWith("-mcp"))
  .sort();

function listFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...listFiles(path));
    else if (/\.(ts|mts|js|mjs)$/.test(entry)) out.push(path);
  }
  return out;
}

describe("cross-platform prompts come only from @cesteral/shared", () => {
  it("covers both prompts with every argument", () => {
    expect(PROMPT_NAMES.sort()).toEqual(Object.keys(ARG_SETS).sort());
    for (const { prompt } of CROSS_PLATFORM_PROMPTS) {
      const covered = new Set(ARG_SETS[prompt.name].flatMap((args) => Object.keys(args)));
      for (const arg of prompt.arguments) expect(covered.has(arg.name)).toBe(true);
    }
  });

  it("no package source outside shared defines a cross-platform prompt", () => {
    const offenders = [];
    for (const pkg of packages) {
      const src = join(ROOT, "packages", pkg, "src");
      if (!existsSync(src)) continue;
      for (const file of listFiles(src)) {
        const text = readFileSync(file, "utf8");
        for (const name of PROMPT_NAMES) {
          if (text.includes(`"${name}"`) || text.includes(`'${name}'`)) {
            offenders.push(`${relative(ROOT, file)}: ${name}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("every registering server publishes the shared metadata and renders identical text", async () => {
    const expected = new Map(CROSS_PLATFORM_PROMPTS.map((p) => [p.prompt.name, p]));
    const registering = [];
    const problems = [];

    for (const pkg of packages) {
      await withServerClient(pkg, async (client) => {
        if (!client.getServerCapabilities()?.prompts) return;
        const { prompts } = await client.request(
          { method: "prompts/list", params: {} },
          IDENTITY_SCHEMA
        );
        const found = prompts.filter((p) => expected.has(p.name));
        if (found.length === 0) return;
        registering.push(pkg);
        if (found.length !== PROMPT_NAMES.length) {
          problems.push(`${pkg}: registers ${found.map((p) => p.name)} but not all of them`);
        }

        for (const listed of found) {
          const { prompt, generateMessage } = expected.get(listed.name);
          if (listed.description !== prompt.description) {
            problems.push(`${pkg} ${listed.name}: description differs from @cesteral/shared`);
          }
          const listedArgs = (listed.arguments ?? []).map((a) => ({
            name: a.name,
            description: a.description,
            required: a.required ?? false,
          }));
          if (JSON.stringify(listedArgs) !== JSON.stringify(prompt.arguments)) {
            problems.push(`${pkg} ${listed.name}: arguments differ from @cesteral/shared`);
          }

          for (const args of ARG_SETS[listed.name]) {
            const result = await client.request(
              { method: "prompts/get", params: { name: listed.name, arguments: args } },
              IDENTITY_SCHEMA
            );
            const text = (result.messages ?? []).map((m) => m.content?.text ?? "").join("\n");
            if (text !== generateMessage(args)) {
              problems.push(
                `${pkg} ${listed.name} ${JSON.stringify(args)}: rendered text differs from @cesteral/shared`
              );
            }
          }
        }
      });
    }

    expect(problems).toEqual([]);
    expect(registering).toEqual(packages);
  }, 120_000);
});

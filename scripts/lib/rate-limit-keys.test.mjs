// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// Ratchet: every rate-limit key a server consumes must match a pattern that
// server's limiter is configured with. A key that matches nothing makes
// `consume` a silent no-op — cm360 (bare "cm360" vs `cm360:*`) and sa360's v2
// path (`sa360v2:…` vs `sa360:*`) both shipped that, unthrottled, while the
// server card published a limit read off the configured patterns.
//
// Static analysis; see rate-limit-keys.mjs for exactly what it can and cannot
// see. Matching uses the real shared RateLimiter (built dist), not a restated
// glob, so the ratchet agrees with the code that enforces the limit.

import { describe, expect, it } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT } from "./boot-server.mjs";
import {
  describeCall,
  extractConfiguredPatterns,
  extractConsumeCalls,
  extractStringConsts,
  scanPackage,
} from "./rate-limit-keys.mjs";

const limiterModule = join(ROOT, "packages", "shared", "dist", "utils", "rate-limiter.js");
if (!existsSync(limiterModule)) {
  throw new Error(`${limiterModule} not found. Build @cesteral/shared before this suite.`);
}
const { RateLimiter } = await import(pathToFileURL(limiterModule).href);

/** Does `key` fall under any of `patterns`, per the real limiter? */
function isGoverned(patterns, key) {
  const limiter = new RateLimiter();
  try {
    for (const pattern of patterns) limiter.configure(pattern, 1, 60_000);
    return limiter.getRemainingTokens(key) !== Infinity;
  } finally {
    limiter.destroy();
  }
}

/** Why a resolved call fails the ratchet, or null. */
function violation(patterns, call) {
  if (call.kind === "unresolved") {
    return "key is not a string literal, template literal or string const — the ratchet cannot see it";
  }
  if (call.kind === "template" && call.staticPrefix === "") {
    return "template key has no static prefix — the platform prefix must be fixed in source";
  }
  if (patterns.length === 0) return "package configures no rate-limit pattern";
  if (!isGoverned(patterns, call.key)) {
    return `key ${JSON.stringify(call.key)} matches none of [${patterns.join(", ")}] — consume() is a silent no-op`;
  }
  return null;
}

describe("extractor", () => {
  it("finds consume calls on any limiter receiver, including optional chaining and multi-line", () => {
    const calls = extractConsumeCalls(
      [
        `await this.rateLimiter.consume("a:b");`,
        `await this.rateLimiter?.consume('a:c', 3);`,
        "await limiter.consume(`a:${id}`);",
        `await this.rateLimiter.consume(`,
        `  KEY,`,
        `  3`,
        `);`,
        `await this.jtiStore.consumeOnce("not-a-limiter");`,
      ].join("\n")
    );
    expect(calls.map((c) => [c.line, c.kind, c.key ?? c.name])).toEqual([
      [1, "literal", "a:b"],
      [2, "literal", "a:c"],
      [3, "template", "a:x"],
      [4, "identifier", "KEY"],
    ]);
  });

  it("records a template's static prefix, and treats computed keys as unresolved", () => {
    const [dynamic, computed, called] = extractConsumeCalls(
      [
        "rateLimiter.consume(`${platform}:default`);",
        `rateLimiter.consume("a:" + id);`,
        `rateLimiter.consume(keyFor(id));`,
      ].join("\n")
    );
    expect(dynamic).toMatchObject({ kind: "template", staticPrefix: "" });
    expect(computed.kind).toBe("unresolved");
    expect(called.kind).toBe("unresolved");
  });

  it("reads patterns from the platform factory and literal configure calls", () => {
    expect(
      extractConfiguredPatterns(
        [
          `export const rateLimiter = createPlatformRateLimiter("cm360", mcpConfig.x);`,
          `export const rateLimiter = createPlatformRateLimiter(`,
          `  "amazon_dsp",`,
          `  n`,
          `);`,
          `rateLimiter.configure("special:key", 1, 1000);`,
        ].join("\n")
      )
    ).toEqual(["cm360:*", "amazon_dsp:*", "special:key"]);
  });

  it("resolves exported string consts", () => {
    const consts = extractStringConsts(
      `export const MSADS_READ_KEY = "msads:read";\nconst OTHER: string = 'x:y';\n`
    );
    expect(consts.get("MSADS_READ_KEY")).toBe("msads:read");
    expect(consts.get("OTHER")).toBe("x:y");
  });
});

describe("the rule catches the shapes that shipped", () => {
  it("flags cm360's bare key and sa360's v2 prefix, and passes their fixes", () => {
    const [bareCm360, oldSa360, fixedCm360, fixedSa360] = extractConsumeCalls(
      [
        `rateLimiter.consume("cm360");`,
        "rateLimiter.consume(`sa360v2:${advertiserId}`);",
        "rateLimiter.consume(`cm360:${profileId}`);",
        "rateLimiter.consume(`sa360:v2:${advertiserId}`);",
      ].join("\n")
    );
    expect(violation(["cm360:*"], bareCm360)).toMatch(/silent no-op/);
    expect(violation(["sa360:*"], oldSa360)).toMatch(/silent no-op/);
    expect(violation(["cm360:*"], fixedCm360)).toBeNull();
    expect(violation(["sa360:*"], fixedSa360)).toBeNull();
  });
});

describe("every consumed rate-limit key matches its package's configured limiter", () => {
  const packages = readdirSync(join(ROOT, "packages"))
    .filter((p) => p.endsWith("-mcp"))
    .sort();
  const scans = packages.map((pkg) => scanPackage(ROOT, pkg));

  it("is not vacuous", () => {
    // Every server in the fleet rate-limits; a regex that silently stopped
    // matching would otherwise turn this ratchet green by finding nothing.
    for (const scan of scans) {
      expect(scan.calls.length, `${scan.pkg}: no consume() calls found`).toBeGreaterThan(0);
      expect(scan.patterns.length, `${scan.pkg}: no configured pattern found`).toBeGreaterThan(0);
    }
  });

  for (const scan of scans) {
    it(`${scan.pkg}`, () => {
      const failures = scan.calls
        .map((call) => ({ call, why: violation(scan.patterns, call) }))
        .filter((f) => f.why !== null)
        .map((f) => `${describeCall(f.call)}: ${f.why}`);
      expect(failures, failures.join("\n")).toEqual([]);
    });
  }
});

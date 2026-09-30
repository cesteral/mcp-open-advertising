// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// Fleet-wide governed-contract identity invariant.
//
// Boots each built server, lists its tools over the real tools/list wire, and
// for every GOVERNED tool (annotations.cesteral present) asserts the documented
// contractId invariant:
//
//   contractId === `${contractPlatformSlug}.${contractToolSlug}.v${schemaVersion}`
//
// Downstream governance (`cesteral-intelligence` admitWriteTool) reads the
// annotation's `contractPlatformSlug` / `contractToolSlug` fields and rejects a
// tool whose `contractId` does not match the slug-derived form. The release
// manifest historically *derived* the slugs from `contractId` and never
// cross-checked the annotation fields, so a mismatch (e.g. slug "linkedin" with
// contractId "linkedin_ads.upload_image.v1") passed every local gate yet would
// be refused at admission. This test closes that gap in CI rather than letting
// it surface downstream.

import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { withServerClient, listRawTools, ROOT } from "./boot-server.mjs";

const packages = readdirSync(join(ROOT, "packages"))
  .filter((p) => p.endsWith("-mcp"))
  .sort();

describe("governed contractId identity invariant", () => {
  for (const pkg of packages) {
    it(`${pkg}: every governed tool's contractId == slug.toolSlug.vN`, async () => {
      const tools = await withServerClient(pkg, listRawTools);
      const governed = tools.filter((t) => t.annotations?.cesteral);

      for (const tool of governed) {
        const c = tool.annotations.cesteral;

        expect(
          typeof c.contractPlatformSlug,
          `${tool.name}: contractPlatformSlug must be a string`
        ).toBe("string");
        expect(typeof c.contractToolSlug, `${tool.name}: contractToolSlug must be a string`).toBe(
          "string"
        );
        expect(typeof c.schemaVersion, `${tool.name}: schemaVersion must be a number`).toBe(
          "number"
        );

        const expected = `${c.contractPlatformSlug}.${c.contractToolSlug}.v${c.schemaVersion}`;
        expect(
          c.contractId,
          `${tool.name}: contractId ${JSON.stringify(c.contractId)} must equal ` +
            `${JSON.stringify(expected)} (contractId == contractPlatformSlug.contractToolSlug.v<schemaVersion>)`
        ).toBe(expected);
      }
    });
  }
});

// One contract namespace per server (#235).
//
// Governance keys policy on the contractId's platform slug, and so does this
// repo: `resolveTokenMode` reads the per-server override from
// `GOVERNANCE_TOKEN_MODE_<SLUG>`, with the slug taken from the contractId.
// gads shipped 8 governed tools as `google_ads.*` and 3 as `gads.*`, so
// `GOVERNANCE_TOKEN_MODE_GOOGLE_ADS=enforce` enforced the 8 and left
// gads_duplicate_entity, gads_upload_image and gads_upload_video on the
// global mode. A server whose governed tools share one slug cannot be split
// that way.
describe("one contractPlatformSlug per server", () => {
  for (const pkg of packages) {
    it(`${pkg}: every governed tool uses the same contractPlatformSlug`, async () => {
      const tools = await withServerClient(pkg, listRawTools);
      const bySlug = new Map();
      for (const tool of tools) {
        const slug = tool.annotations?.cesteral?.contractPlatformSlug;
        if (slug === undefined) continue;
        bySlug.set(slug, [...(bySlug.get(slug) ?? []), tool.name]);
      }
      const summary = [...bySlug].map(([slug, names]) => `${slug}: ${names.join(", ")}`);
      expect(
        bySlug.size,
        `${pkg} splits its contracts across slugs:\n  ${summary.join("\n  ")}`
      ).toBeLessThanOrEqual(1);
    });
  }
});

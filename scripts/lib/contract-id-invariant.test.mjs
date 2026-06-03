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

// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// Fleet-wide release gate: every governed entity-write tool's `readPartner`
// must be self-describing.
//
// An entity-write contract declares a `readPartner` (the read tool that
// produces its before/after snapshot) plus an `argMap` mapping the write tool's
// arg names to the read tool's arg names. Governance reads the connector's
// manifest and calls the read partner using ONLY that argMap — so if the read
// partner has a REQUIRED arg that no argMap value supplies, the read is not
// satisfiable from the manifest alone (it silently relies on a naming
// convention). Risk #6 of the decision-token plan: DV360's update/delete/
// duplicate argMaps omitted the `entityType` discriminator that
// `dv360_get_entity` requires.
//
// This gate boots each server, reads the real tools/list wire (the exact
// representation governance ingests), and asserts for every governed write with
// a readPartner:
//   - the readPartner tool is advertised by the same server, and
//   - every REQUIRED arg of the readPartner that the write tool can SUPPLY from
//     its own inputs is covered by some argMap value (Object.values(argMap)).
//
// Required args come from the read partner's wire JSON-Schema `required` array.
// "Can supply" means the write tool declares an input arg of the same name: a
// `create_entity` write has no `entityId` input (the id only exists after the
// create, and governance reads the `after` snapshot by the created id from the
// response, not from the manifest), so the gate must not demand it — while
// `entityType`, which every governed entity write DOES take as input, must
// always be mapped. This is the discriminator DV360 omitted (Risk #6).

import { describe, expect, it } from "vitest";
import { withServerClient, listRawTools, ROOT } from "./boot-server.mjs";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const packages = readdirSync(join(ROOT, "packages"))
  .filter((p) => p.endsWith("-mcp"))
  .sort();

/** Top-level required args of a tool's wire input schema (empty if none/union). */
function requiredArgs(tool) {
  const schema = tool?.inputSchema;
  return Array.isArray(schema?.required) ? schema.required : [];
}

/**
 * Every input arg name a tool accepts — top-level `properties` plus the union
 * of any `anyOf`/`oneOf` branch properties (discriminated-union schemas, e.g.
 * `*_duplicate_entity`, carry their args inside branches, not at the top).
 */
function inputArgNames(tool) {
  const schema = tool?.inputSchema ?? {};
  const names = new Set(Object.keys(schema.properties ?? {}));
  for (const branch of schema.anyOf ?? schema.oneOf ?? []) {
    for (const name of Object.keys(branch.properties ?? {})) names.add(name);
  }
  return names;
}

describe("governed write readPartner.argMap self-containment", () => {
  for (const pkg of packages) {
    it(`${pkg}: every readPartner covers its read tool's required args`, async () => {
      const tools = await withServerClient(pkg, listRawTools);
      const byName = new Map(tools.map((t) => [t.name, t]));

      const problems = [];
      for (const tool of tools) {
        const readPartner = tool.annotations?.cesteral?.readPartner;
        if (!readPartner) continue;

        const { toolName, argMap } = readPartner;
        const readTool = byName.get(toolName);
        if (!readTool) {
          problems.push(`${tool.name}: readPartner "${toolName}" is not advertised by ${pkg}`);
          continue;
        }

        const mappedReadArgs = new Set(Object.values(argMap ?? {}));
        const suppliable = inputArgNames(tool);
        // Only fault required read args the write tool can actually source from
        // its own inputs; response-derived ids (e.g. create's entityId) are out
        // of the manifest's reach and legitimately unmapped.
        const missing = requiredArgs(readTool).filter(
          (arg) => suppliable.has(arg) && !mappedReadArgs.has(arg)
        );
        if (missing.length > 0) {
          problems.push(
            `${tool.name}: readPartner "${toolName}" requires [${missing.join(", ")}] ` +
              `but argMap supplies only [${[...mappedReadArgs].join(", ")}] — ` +
              `add the missing arg(s) to readPartner.argMap`
          );
        }
      }

      expect(problems, problems.join("\n")).toEqual([]);
    });
  }
});

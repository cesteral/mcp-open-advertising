#!/usr/bin/env node
// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// Rewrites scripts/lib/tool-definition-hashes.snapshot.json from the live
// tools/list of every server (#242). Run after an intended change to a tool's
// name, description, schemas or annotations; the snapshot diff is what a
// reviewer checks. Needs a prior `pnpm run build`.

import { writeFileSync } from "node:fs";
import { withServerClient, listRawTools } from "../lib/boot-server.mjs";
import { fleetPackages } from "../lib/fleet-snapshot.mjs";
import { SNAPSHOT_PATH, definitionHashesOf } from "../lib/tool-definition-hashes.mjs";

const snapshot = {};
let count = 0;
for (const pkg of fleetPackages()) {
  snapshot[pkg] = definitionHashesOf(await withServerClient(pkg, (c) => listRawTools(c)));
  count += Object.keys(snapshot[pkg]).length;
}
writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2) + "\n");
console.log(
  `Wrote ${SNAPSHOT_PATH} (${count} tools across ${Object.keys(snapshot).length} servers)`
);

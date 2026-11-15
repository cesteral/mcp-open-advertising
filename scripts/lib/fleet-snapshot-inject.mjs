// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// Test-side access to the fleet snapshot that fleet-snapshot-global-setup.mjs
// booted once for the whole run. Import this from a vitest test file only.

import { inject } from "vitest";

/**
 * The snapshot of `pkg` (see snapshotServer in fleet-snapshot.mjs for its
 * shape). The objects are the suite's shared copy: read them, do not mutate.
 */
export function serverSnapshot(pkg) {
  const snapshot = inject("fleetSnapshot")?.[pkg];
  if (!snapshot) {
    throw new Error(
      `No fleet snapshot for ${pkg}. It is provided by scripts/lib/fleet-snapshot-global-setup.mjs, ` +
        `which vitest.config.scripts.ts registers: run this test through that config.`
    );
  }
  return snapshot;
}

/** The raw `tools/list` wire objects of `pkg`, as `listRawTools` returns them. */
export const toolsOf = (pkg) => serverSnapshot(pkg).tools;

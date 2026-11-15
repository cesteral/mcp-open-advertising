// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// vitest `globalSetup` for the root `scripts` suite (vitest.config.scripts.ts):
// boots every server once and provides what they advertise to every test file
// as `fleetSnapshot`. Read it with fleet-snapshot-inject.mjs.

import { snapshotFleet } from "./fleet-snapshot.mjs";

export default async function setup({ provide }) {
  provide("fleetSnapshot", await snapshotFleet());
}

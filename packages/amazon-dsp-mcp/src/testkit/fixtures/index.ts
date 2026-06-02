// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Fixture barrel. Concatenates per-surface fixture modules into the public
 * `allFixtures` registry consumed by `getFixtures()` and `assertContract`.
 */

import type { AmazonDspWriteFixture } from "../types.js";
import { allEntityFixtures } from "./entity.js";
import { allCommitmentFixtures } from "./commitment.js";
import { allCreateFixtures } from "./create.js";

export * from "./entity.js";
export * from "./commitment.js";
export * from "./create.js";

export const allFixtures: readonly AmazonDspWriteFixture[] = [
  ...allEntityFixtures,
  ...allCommitmentFixtures,
  ...allCreateFixtures,
];

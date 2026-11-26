// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * `@cesteral/shared/testkit`: the parameterised vitest suites every server's
 * tests call instead of carrying a copy.
 *
 * Test-only. This entry imports `vitest`, which is a devDependency of every
 * consumer and of this package; nothing in the package's other entry points
 * imports it, so production code and `pnpm deploy --prod` images never load it.
 */

export * from "./cross-server-contract.js";
export * from "./schema-size.js";
export * from "./server-card.js";
export * from "./terminal-confirmation.js";

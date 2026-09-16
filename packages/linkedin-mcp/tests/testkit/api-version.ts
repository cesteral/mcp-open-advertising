// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * A deliberately synthetic `LinkedIn-Version` for tests that only care that the
 * version they pass in is the version sent back out.
 *
 * It is intentionally NOT the real pin. These fixtures used to hard-code
 * `202409`, which meant a green suite read as evidence that `202409` was fine
 * long after LinkedIn had sunset it (#206). A value that cannot plausibly be
 * the pin keeps pass-through coverage honest about what it proves.
 *
 * The real pin is asserted in `tests/config/api-version.test.ts`.
 */
export const TEST_LINKEDIN_API_VERSION = "209901";

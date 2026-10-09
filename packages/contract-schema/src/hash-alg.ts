// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";

/**
 * The names of the canonicalizations a governance hash can be computed under.
 *
 * This package owns the NAMES (it owns the shape of what crosses the wire);
 * `@cesteral/contract-hash` owns the ALGORITHMS and exports the same list under
 * the same name. Neither depends on the other, so a workspace test pins the two
 * lists equal — a name added in one place only fails there.
 *
 * - `cesteral-c14n-v1` — the original canonicalization. Every hash minted before
 *   `hashAlg` existed was computed this way, so an ABSENT `hashAlg` means this.
 * - `rfc8785` — RFC 8785 (JCS), reproducible in any language from the RFC.
 */
export const HASH_ALGS = ["cesteral-c14n-v1", "rfc8785"] as const;

export type HashAlg = (typeof HASH_ALGS)[number];

// Typed as `z.ZodType<HashAlg>` (not the inferred `ZodEnum`) so the emitted `.d.ts`
// carries no zod-version-specific structure — see the other enum schemas here.
export const hashAlgSchema: z.ZodType<HashAlg> = z.enum(HASH_ALGS);

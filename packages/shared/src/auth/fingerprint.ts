// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { createHash } from "crypto";

/**
 * Build a 32-char hex fingerprint from one or more credential parts.
 *
 * Each part is trimmed before hashing and joined with `:` so a single string
 * and a multi-part credential never collide. Used by every auth adapter for
 * session-binding fingerprints — keep the implementation in one place so any
 * change (algorithm, length, separator) lands everywhere at once.
 */
export function fingerprintCredentials(...parts: string[]): string {
  return createHash("sha256")
    .update(parts.map((p) => p.trim()).join(":"))
    .digest("hex")
    .substring(0, 32);
}

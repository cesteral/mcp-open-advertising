// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * v2 (DoubleClick Search) keys must be governed by their own limit, so raising
 * the Reporting API v0 limit (SA360_RATE_LIMIT_PER_MINUTE) never raises the v2
 * limit, whose quota is separate and unpublished. That the MOST SPECIFIC
 * pattern governs a key is tested in packages/shared rate-limiter.test.ts.
 */

import { describe, it, expect } from "vitest";
import { rateLimiter } from "../../src/utils/platform.js";

describe("sa360 limiter", () => {
  it("configures a separate sa360:v2:* limit alongside sa360:*", () => {
    const patterns = rateLimiter.describeLimits().map((l) => l.pattern);
    expect(patterns).toEqual(expect.arrayContaining(["sa360:*", "sa360:v2:*"]));
  });
});

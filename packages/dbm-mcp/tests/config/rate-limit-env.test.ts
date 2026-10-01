// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { parseConfig } from "../../src/config/index.js";

/**
 * Fleet review _cross-fleet #27: dbm read the unprefixed RATE_LIMIT_PER_MINUTE
 * while every other server reads <PLATFORM>_RATE_LIMIT_PER_MINUTE. It now reads
 * DBM_RATE_LIMIT_PER_MINUTE, and still accepts the old name so an existing
 * deployment keeps its limit.
 */
describe("dbm rate-limit env var", () => {
  const NAMES = ["DBM_RATE_LIMIT_PER_MINUTE", "RATE_LIMIT_PER_MINUTE"] as const;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const name of NAMES) {
      saved[name] = process.env[name];
      delete process.env[name];
    }
  });

  afterEach(() => {
    for (const name of NAMES) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  });

  it("defaults to 10 when neither name is set", () => {
    expect(parseConfig().rateLimitPerMinute).toBe(10);
  });

  it("reads DBM_RATE_LIMIT_PER_MINUTE", () => {
    process.env.DBM_RATE_LIMIT_PER_MINUTE = "7";
    expect(parseConfig().rateLimitPerMinute).toBe(7);
  });

  it("still reads the legacy RATE_LIMIT_PER_MINUTE", () => {
    process.env.RATE_LIMIT_PER_MINUTE = "4";
    expect(parseConfig().rateLimitPerMinute).toBe(4);
  });

  it("prefers DBM_RATE_LIMIT_PER_MINUTE when both are set", () => {
    process.env.DBM_RATE_LIMIT_PER_MINUTE = "7";
    process.env.RATE_LIMIT_PER_MINUTE = "4";
    expect(parseConfig().rateLimitPerMinute).toBe(7);
  });
});

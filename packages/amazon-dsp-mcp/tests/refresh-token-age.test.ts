// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, it, expect } from "vitest";
import {
  evaluateRefreshTokenAge,
  buildRefreshTokenAgeHealth,
} from "../src/utils/refresh-token-age.js";

const NOW = new Date("2027-01-15T00:00:00Z");

describe("evaluateRefreshTokenAge", () => {
  it("returns undefined when tracking is not configured", () => {
    expect(evaluateRefreshTokenAge(undefined, NOW, 335)).toBeUndefined();
  });

  it("returns undefined for an unparseable or future issuedAt", () => {
    expect(evaluateRefreshTokenAge("not-a-date", NOW, 335)).toBeUndefined();
    expect(evaluateRefreshTokenAge("2028-01-01", NOW, 335)).toBeUndefined();
  });

  it("reports ok below the warn threshold", () => {
    // Issued 100 days before NOW
    const result = evaluateRefreshTokenAge("2026-10-07T00:00:00Z", NOW, 335);
    expect(result).toEqual({ ageDays: 100, daysUntilExpiry: 265, warn: false, expired: false });
  });

  it("warns exactly at the threshold, before expiry", () => {
    // Issued 335 days before NOW (2026-02-14 + 335d = 2027-01-15)
    const result = evaluateRefreshTokenAge("2026-02-14T00:00:00Z", NOW, 335);
    expect(result).toEqual({ ageDays: 335, daysUntilExpiry: 30, warn: true, expired: false });
  });

  it("flags expiry once 365 days have elapsed", () => {
    const result = evaluateRefreshTokenAge("2026-01-15T00:00:00Z", NOW, 335);
    expect(result).toEqual({ ageDays: 365, daysUntilExpiry: 0, warn: true, expired: true });
  });
});

describe("buildRefreshTokenAgeHealth", () => {
  it("returns undefined when tracking is not configured", () => {
    expect(buildRefreshTokenAgeHealth(undefined, NOW, 335)).toBeUndefined();
  });

  it("maps evaluation states to the operator-facing status field", () => {
    expect(buildRefreshTokenAgeHealth("2026-10-07T00:00:00Z", NOW, 335)).toMatchObject({
      refreshTokenStatus: "ok",
      refreshTokenAgeDays: 100,
    });
    expect(buildRefreshTokenAgeHealth("2026-02-14T00:00:00Z", NOW, 335)).toMatchObject({
      refreshTokenStatus: "reauthorization-needed-soon",
      refreshTokenDaysUntilExpiry: 30,
    });
    expect(buildRefreshTokenAgeHealth("2026-01-15T00:00:00Z", NOW, 335)).toMatchObject({
      refreshTokenStatus: "expired",
    });
  });
});

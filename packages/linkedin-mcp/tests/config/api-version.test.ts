// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * The test that was missing, and whose absence let #206 happen.
 *
 * `linkedin-mcp` pinned `LinkedIn-Version: 202409` for roughly a year past its
 * sunset. Nothing caught it: no test asserted anything about the value, the
 * fixtures hard-coded the same dead literal so a green suite looked like
 * evidence, and no CI job exercises the live API.
 *
 * The staleness assertion below is a deliberate time bomb. It will fail on its
 * own, without anyone touching this package, once the pin approaches the end of
 * LinkedIn's support window. That is the point: a red CI is a far cheaper way to
 * discover a dead version than a silently broken server.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  LINKEDIN_API_VERSION,
  LINKEDIN_API_VERSION_VERIFIED_AT,
  LINKEDIN_VERSION_SUPPORT_MONTHS,
  LINKEDIN_VERSION_REFRESH_LEAD_MONTHS,
  isValidLinkedInApiVersion,
  monthsSinceVersion,
  classifyLinkedInApiVersion,
  describeLinkedInApiVersionStatus,
} from "../../src/config/api-version.js";

describe("the pinned LinkedIn-Version", () => {
  it("is a well-formed YYYYMM moniker", () => {
    expect(isValidLinkedInApiVersion(LINKEDIN_API_VERSION)).toBe(true);
  });

  it("is still inside LinkedIn's support window", () => {
    const status = classifyLinkedInApiVersion(LINKEDIN_API_VERSION);

    // If this fails: LinkedIn sunsets each release after a minimum of one year,
    // and a sunset version header returns an ERROR on every request — the whole
    // server is down against its platform. Check the supported list at
    // https://learn.microsoft.com/en-us/linkedin/marketing/versioning, bump
    // LINKEDIN_API_VERSION, set LINKEDIN_API_VERSION_VERIFIED_AT to today, and
    // diff the entity schemas: monthly releases between the old pin and the new
    // one can change field shapes, so this is a migration and not only a header
    // swap.
    expect(
      status,
      describeLinkedInApiVersionStatus(LINKEDIN_API_VERSION) ?? "pin is current"
    ).not.toBe("sunset");
  });

  it("records when a human last checked it against LinkedIn's published list", () => {
    // `verifiedAt` must be the date of the CHECK, never backdated to the pin's
    // release month — a backdated record reproduces the false confidence this
    // guards against. So it must not predate the release it claims to verify.
    expect(LINKEDIN_API_VERSION_VERIFIED_AT).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const verifiedMonth = LINKEDIN_API_VERSION_VERIFIED_AT.slice(0, 7).replace("-", "");
    expect(Number(verifiedMonth)).toBeGreaterThanOrEqual(Number(LINKEDIN_API_VERSION));
  });
});

describe("version classification", () => {
  const NOW = new Date("2026-09-16T00:00:00Z");

  it("counts whole months from the moniker", () => {
    expect(monthsSinceVersion("202609", NOW)).toBe(0);
    expect(monthsSinceVersion("202608", NOW)).toBe(1);
    expect(monthsSinceVersion("202509", NOW)).toBe(12);
    // The real #206 pin, at the date it was finally found.
    expect(monthsSinceVersion("202409", NOW)).toBe(24);
  });

  it("treats a version at exactly the window boundary as sunset", () => {
    // LinkedIn documents "a minimum of one year", so the boundary is the last
    // moment the version is guaranteed, not the first moment it is safe.
    expect(monthsSinceVersion("202509", NOW)).toBe(LINKEDIN_VERSION_SUPPORT_MONTHS);
    expect(classifyLinkedInApiVersion("202509", NOW)).toBe("sunset");
  });

  it("flags a version approaching the boundary for refresh", () => {
    const refreshDue = LINKEDIN_VERSION_SUPPORT_MONTHS - LINKEDIN_VERSION_REFRESH_LEAD_MONTHS;
    expect(refreshDue).toBe(9);

    expect(classifyLinkedInApiVersion("202512", NOW)).toBe("refresh-due"); // 9 months
    expect(classifyLinkedInApiVersion("202601", NOW)).toBe("current"); // 8 months
  });

  it("classifies the version that caused #206 as sunset", () => {
    expect(classifyLinkedInApiVersion("202409", NOW)).toBe("sunset");
  });

  it("explains a sunset version in terms an operator can act on", () => {
    const message = describeLinkedInApiVersionStatus("202409", NOW);

    expect(message).toContain("202409");
    expect(message).toContain("ERROR");
    expect(message).toContain("LINKEDIN_API_VERSION");
  });

  it("says nothing about a current version", () => {
    expect(describeLinkedInApiVersionStatus("202608", NOW)).toBeUndefined();
  });

  it("rejects values that are not YYYYMM monikers", () => {
    for (const bad of ["2026-08", "20268", "2026013", "abcdef", "", "201412", "202613"]) {
      expect(isValidLinkedInApiVersion(bad), bad).toBe(false);
      expect(() => monthsSinceVersion(bad)).toThrow(/YYYYMM/);
    }
  });
});

describe(".env.example", () => {
  // `.env.example` used to set LINKEDIN_API_VERSION=202501. Config reads the env
  // var ahead of the pin, so anyone who copied the example silently overrode
  // 202608 with a version past its support window — #206 again, one file over.
  it("does not override the pinned LinkedIn-Version with a stale literal", () => {
    const envExample = readFileSync(
      fileURLToPath(new URL("../../.env.example", import.meta.url)),
      "utf-8"
    );
    const assignments = envExample
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("LINKEDIN_API_VERSION="));
    for (const line of assignments) {
      expect(line, "an active assignment must equal the pin, or be commented out").toBe(
        `LINKEDIN_API_VERSION=${LINKEDIN_API_VERSION}`
      );
    }
  });
});

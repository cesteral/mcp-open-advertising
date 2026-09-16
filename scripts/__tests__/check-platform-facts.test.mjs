// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// #202. Two properties are worth pinning here, and they are different:
//
//   1. The SHIPPED ledger actually describes the code. This runs against the
//      real platform-facts.json and the real repo, not a fixture — a fixture
//      would let the ledger drift from the config files without any test
//      noticing, which is the exact failure the ledger exists to prevent.
//   2. An expired fact is NOT current, and being unable to check it does not
//      make it fresh.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateLedger,
  checkCodeRefs,
  assessFreshness,
  REFRESH_DAYS,
} from "../check-platform-facts.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ledger = JSON.parse(readFileSync(join(ROOT, "platform-facts.json"), "utf-8"));

describe("the shipped ledger", () => {
  it("is structurally valid", () => {
    expect(validateLedger(ledger)).toEqual([]);
  });

  it("points at code that exists and still carries the declared value", () => {
    // The load-bearing check. If someone bumps a pinned API version without
    // touching the ledger, this is what says so.
    expect(checkCodeRefs(ledger, ROOT)).toEqual([]);
  });

  it("covers every server package that hardcodes an API base URL", () => {
    const covered = new Set(ledger.facts.map((f) => f.package));
    for (const pkg of [
      "gads-mcp",
      "dv360-mcp",
      "cm360-mcp",
      "meta-mcp",
      "sa360-mcp",
      "ttd-mcp",
      "msads-mcp",
      "linkedin-mcp",
      "amazon-dsp-mcp",
      "pinterest-mcp",
      "snapchat-mcp",
      "tiktok-mcp",
    ]) {
      expect(covered, `${pkg} has no platform-facts entry`).toContain(pkg);
    }
  });

  it("records every fact as unverified, because none of them has been checked", () => {
    // Honest starting state, and deliberately not glossed. The vendor doc hosts
    // are unreachable from this repo's egress policy, so nobody has read a
    // supported-version table. A ledger that opened at `verified` would be the
    // false confidence it exists to remove.
    for (const fact of ledger.facts) {
      expect(fact.status, `${fact.id}`).toBe("unverified");
      expect(fact.verifiedAt, `${fact.id}`).toBeNull();
      expect(fact.verifyBy, `${fact.id} needs a deadline`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("marks the LinkedIn version pin load-bearing — it is the #206 failure mode", () => {
    const fact = ledger.facts.find((f) => f.id === "linkedin.api_version");
    expect(fact).toBeTruthy();
    expect(fact.loadBearing).toBe(true);
    expect(fact.class).toBe("date-versioned-header");
    // Tightest cadence of any class: a sunset header errors, it does not warn.
    expect(REFRESH_DAYS[fact.class]).toBe(90);
  });

  it("agrees with linkedin-mcp's own verification basis", () => {
    // The ledger says `unverified`; api-version.ts says the pin was `inferred`.
    // If someone flips that constant to "confirmed" without re-verifying here,
    // the two halves start telling different stories — which is precisely the
    // incoherence #209 shipped by recording a date with no basis beside it.
    const src = readFileSync(
      join(ROOT, "packages/linkedin-mcp/src/config/api-version.ts"),
      "utf-8"
    );
    const basis = /LINKEDIN_API_VERSION_VERIFICATION_BASIS[^=]*=\s*"(confirmed|inferred)"/.exec(
      src
    );
    expect(basis, "api-version.ts must declare how the pin was established").toBeTruthy();

    const fact = ledger.facts.find((f) => f.id === "linkedin.api_version");
    if (basis[1] === "inferred") {
      expect(fact.status).toBe("unverified");
    }
  });
});

describe("validateLedger rejects the shapes that would make a status meaningless", () => {
  const base = {
    id: "x.y",
    package: "x-mcp",
    class: "versioned-base-url",
    claim: "a claim long enough to be re-checkable without guessing",
    value: "v1",
    loadBearing: true,
    codeRefs: ["package.json"],
  };
  const wrap = (fact) => ({ schemaVersion: 1, facts: [fact] });

  it("rejects `verified` with no verifiedAt", () => {
    const errors = validateLedger(wrap({ ...base, status: "verified", verifyBy: "2027-01-01" }));
    expect(errors.join("\n")).toMatch(/requires verifiedAt/);
  });

  it("rejects `unverified` that nonetheless carries a verifiedAt", () => {
    const errors = validateLedger(
      wrap({ ...base, status: "unverified", verifiedAt: "2026-01-01", verifyBy: "2027-01-01" })
    );
    expect(errors.join("\n")).toMatch(/must not carry a verifiedAt/);
  });

  it("rejects an unverified fact with no deadline", () => {
    const errors = validateLedger(wrap({ ...base, status: "unverified" }));
    expect(errors.join("\n")).toMatch(/verifyBy deadline/);
  });

  it("rejects a duplicate fact id", () => {
    const f = { ...base, status: "unverified", verifyBy: "2027-01-01" };
    expect(validateLedger({ schemaVersion: 1, facts: [f, f] }).join("\n")).toMatch(/duplicate/);
  });

  it("rejects a fact with no codeRefs — an unlocated claim cannot be audited", () => {
    const errors = validateLedger(
      wrap({ ...base, status: "unverified", verifyBy: "2027-01-01", codeRefs: [] })
    );
    expect(errors.join("\n")).toMatch(/codeRefs/);
  });
});

describe("checkCodeRefs catches the ledger drifting from the code", () => {
  it("fails when the referenced line no longer contains the declared value", () => {
    const errors = checkCodeRefs(
      {
        facts: [
          {
            id: "drifted",
            value: "https://googleads.googleapis.com/v99",
            codeRefs: ["packages/gads-mcp/src/config/index.ts:26"],
          },
        ],
      },
      ROOT
    );
    expect(errors.join("\n")).toMatch(/no longer contains the declared value/);
  });

  it("fails when the referenced file is gone", () => {
    const errors = checkCodeRefs(
      { facts: [{ id: "moved", value: "x", codeRefs: ["packages/nope/does-not-exist.ts:1"] }] },
      ROOT
    );
    expect(errors.join("\n")).toMatch(/file does not exist/);
  });

  it("fails when the line number is past the end of the file", () => {
    const errors = checkCodeRefs(
      { facts: [{ id: "oob", value: "x", codeRefs: ["package.json:99999"] }] },
      ROOT
    );
    expect(errors.join("\n")).toMatch(/out of range/);
  });
});

describe("freshness", () => {
  const NOW = new Date("2026-09-16T00:00:00Z");
  const fact = (over) => ({
    id: "f",
    package: "p",
    class: "versioned-base-url",
    claim: "a claim long enough to be re-checkable",
    loadBearing: true,
    codeRefs: ["package.json"],
    ...over,
  });

  it("derives refreshDue from the class cadence when none is given", () => {
    // verified 2026-01-01 + 90 days = 2026-04-01, long past NOW.
    const { stale } = assessFreshness(
      { facts: [fact({ status: "verified", verifiedAt: "2026-01-01" })] },
      NOW
    );
    expect(stale).toHaveLength(1);
    expect(stale[0].due).toBe("2026-04-01");
  });

  it("treats a fact inside its window as current", () => {
    const { stale, overdue } = assessFreshness(
      { facts: [fact({ status: "verified", verifiedAt: "2026-09-01" })] },
      NOW
    );
    expect(stale).toEqual([]);
    expect(overdue).toEqual([]);
  });

  it("reports a never-verified fact past its deadline, rather than passing it", () => {
    // Being unable to check does not make a fact fresh.
    const { overdue } = assessFreshness(
      { facts: [fact({ status: "unverified", verifiedAt: null, verifyBy: "2026-06-01" })] },
      NOW
    );
    expect(overdue).toHaveLength(1);
    expect(overdue[0].days).toBeGreaterThan(100);
  });

  it("does not report a never-verified fact whose deadline is still ahead", () => {
    const { overdue } = assessFreshness(
      { facts: [fact({ status: "unverified", verifiedAt: null, verifyBy: "2027-01-01" })] },
      NOW
    );
    expect(overdue).toEqual([]);
  });

  it("skips a superseded fact — it has been demoted deliberately", () => {
    const { stale, overdue } = assessFreshness(
      { facts: [fact({ status: "superseded", verifiedAt: "2020-01-01" })] },
      NOW
    );
    expect(stale).toEqual([]);
    expect(overdue).toEqual([]);
  });

  it("would have caught the #206 LinkedIn lapse a year before it was found by hand", () => {
    // The issue's worked example. `202409` verified 2024-09-01 on a 90-day
    // cadence is overdue from 2024-11-30 — CI would have said so in 2024, not
    // in 2026-09 when someone finally noticed by reading the code.
    const { stale } = assessFreshness(
      {
        facts: [
          fact({
            id: "linkedin.api_version",
            class: "date-versioned-header",
            status: "verified",
            verifiedAt: "2024-09-01",
          }),
        ],
      },
      new Date("2025-09-01T00:00:00Z")
    );
    expect(stale).toHaveLength(1);
    expect(stale[0].days).toBeGreaterThan(270);
  });
});

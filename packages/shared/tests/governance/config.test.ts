// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, it, expect } from "vitest";
import { resolveTokenMode } from "../../src/index.js";

const C = "meta.update_entity.v1";

describe("resolveTokenMode", () => {
  it("defaults to off with no env off a hosted deployment", () => {
    expect(resolveTokenMode({ contractId: C, env: {} })).toBe("off");
  });

  it("honors the global base mode", () => {
    expect(resolveTokenMode({ contractId: C, env: { GOVERNANCE_TOKEN_MODE: "warn" } })).toBe(
      "warn"
    );
    expect(resolveTokenMode({ contractId: C, env: { GOVERNANCE_TOKEN_MODE: "enforce" } })).toBe(
      "enforce"
    );
  });

  it("ignores an invalid global mode (falls back to off)", () => {
    expect(resolveTokenMode({ contractId: C, env: { GOVERNANCE_TOKEN_MODE: "loud" } })).toBe("off");
  });

  it("per-server mode overrides the global base", () => {
    expect(
      resolveTokenMode({
        contractId: C,
        env: { GOVERNANCE_TOKEN_MODE: "off", GOVERNANCE_TOKEN_MODE_META: "warn" },
      })
    ).toBe("warn");
  });

  it("per-contract enforce list overrides per-server and global", () => {
    expect(
      resolveTokenMode({
        contractId: C,
        env: {
          GOVERNANCE_TOKEN_MODE: "off",
          GOVERNANCE_TOKEN_MODE_META: "warn",
          GOVERNANCE_TOKEN_MODE_ENFORCE_CONTRACTS:
            "meta.update_entity.v1,google_ads.update_entity.v1",
        },
      })
    ).toBe("enforce");
  });

  it("per-contract warn list overrides a global enforce", () => {
    expect(
      resolveTokenMode({
        contractId: C,
        env: {
          GOVERNANCE_TOKEN_MODE: "enforce",
          GOVERNANCE_TOKEN_MODE_WARN_CONTRACTS: "meta.update_entity.v1",
        },
      })
    ).toBe("warn");
  });

  it("per-contract off list can disable a single contract under a global warn", () => {
    expect(
      resolveTokenMode({
        contractId: C,
        env: {
          GOVERNANCE_TOKEN_MODE: "warn",
          GOVERNANCE_TOKEN_MODE_OFF_CONTRACTS: "meta.update_entity.v1",
        },
      })
    ).toBe("off");
  });

  it("resolves a contract listed in BOTH off and enforce to the stricter mode (enforce)", () => {
    // A contradiction on a money-moving gate must fail toward the safer mode —
    // a stray OFF entry must not silently un-govern a contract a rollout put on
    // the ENFORCE list.
    expect(
      resolveTokenMode({
        contractId: C,
        env: {
          GOVERNANCE_TOKEN_MODE_OFF_CONTRACTS: C,
          GOVERNANCE_TOKEN_MODE_ENFORCE_CONTRACTS: C,
        },
      })
    ).toBe("enforce");
  });

  it("resolves a contract listed in BOTH off and warn to warn (stricter than off)", () => {
    expect(
      resolveTokenMode({
        contractId: C,
        env: {
          GOVERNANCE_TOKEN_MODE_OFF_CONTRACTS: C,
          GOVERNANCE_TOKEN_MODE_WARN_CONTRACTS: C,
        },
      })
    ).toBe("warn");
  });

  it("trims whitespace in the contract lists", () => {
    expect(
      resolveTokenMode({
        contractId: C,
        env: { GOVERNANCE_TOKEN_MODE_ENFORCE_CONTRACTS: " a.b.v1 , meta.update_entity.v1 " },
      })
    ).toBe("enforce");
  });
});

// Sweep 2026-07-25, 05-F2. The Tier 3 default was unconditionally `off`, so a
// default-deployed server ran every governed write with no token verification at
// all while its manifest advertised the tools as governed.
describe("resolveTokenMode — hosted default", () => {
  it("defaults to warn on a hosted deployment (K_SERVICE set)", () => {
    expect(resolveTokenMode({ contractId: C, env: { K_SERVICE: "dv360-mcp" } })).toBe("warn");
  });

  it("stays off for stdio / self-host, where nothing mints tokens", () => {
    expect(resolveTokenMode({ contractId: C, env: {} })).toBe("off");
  });

  it("does NOT default to enforce — that posture has to be chosen", () => {
    // enforce rejects any write without a valid token, so inheriting it would
    // break every deployment that has not wired the governance layer yet.
    expect(resolveTokenMode({ contractId: C, env: { K_SERVICE: "dv360-mcp" } })).not.toBe(
      "enforce"
    );
  });

  it("lets an explicit global off win over the hosted default", () => {
    expect(
      resolveTokenMode({
        contractId: C,
        env: { K_SERVICE: "dv360-mcp", GOVERNANCE_TOKEN_MODE: "off" },
      })
    ).toBe("off");
  });

  it("lets per-server and per-contract tiers win over the hosted default", () => {
    expect(
      resolveTokenMode({
        contractId: C,
        env: { K_SERVICE: "dv360-mcp", GOVERNANCE_TOKEN_MODE_META: "enforce" },
      })
    ).toBe("enforce");
    expect(
      resolveTokenMode({
        contractId: C,
        env: { K_SERVICE: "dv360-mcp", GOVERNANCE_TOKEN_MODE_OFF_CONTRACTS: C },
      })
    ).toBe("off");
  });
});

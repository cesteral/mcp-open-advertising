import { describe, it, expect, beforeEach, vi } from "vitest";

import {
  initializeGovernanceRuntime,
  getGovernanceJtiStore,
  resetGovernanceRuntimeForTests,
  hasEnforcedWrite,
} from "../../src/governance/runtime.js";
import { FirestoreJtiStore, InMemoryJtiStore } from "../../src/governance/jti-store.js";
import type { FirestoreLike } from "../../src/governance/jti-store.js";

/**
 * Boot-time governance runtime (issue #166).
 *
 * Two defects this covers:
 *
 *   1. No server injected a distributed jti store, so `registerToolsFromDefinitions`
 *      always fell back to in-memory. Hosted `enforce` was only reachable via the
 *      single-instance opt-out — which reintroduces the cross-instance replay
 *      window enforce exists to close.
 *   2. The safety guard ran inside `registerToolsFromDefinitions`, which the
 *      streamable-HTTP transport calls ONCE PER SESSION. A misconfigured enforce
 *      deploy therefore started cleanly, went green, and then threw on every
 *      session establishment — a 100% outage shaped like a runtime fault instead
 *      of the boot refusal it was documented to be.
 *
 * This module resolves the store once per process and evaluates the safety of the
 * resulting posture at startup, before the process takes traffic.
 */

const logger = () => ({ warn: vi.fn(), info: vi.fn() });

/** A governed write tool whose contractId resolves under the token-mode tiers. */
const WRITE_TOOL = {
  name: "meta_update_entity",
  annotations: { cesteral: { kind: "write", contractId: "meta.update_entity.v1" } },
} as never;

const READ_TOOL = {
  name: "meta_get_entity",
  annotations: { cesteral: { kind: "read", contractId: "meta.get_entity.v1" } },
} as never;

function fakeFirestore(): () => Promise<FirestoreLike> {
  return async () => ({
    collection: () => ({ doc: () => ({ create: async () => undefined }) }),
  });
}

beforeEach(() => {
  resetGovernanceRuntimeForTests();
});

describe("hasEnforcedWrite", () => {
  it("is false when no governed write resolves to enforce", () => {
    expect(hasEnforcedWrite([WRITE_TOOL], { GOVERNANCE_TOKEN_MODE: "warn" })).toBe(false);
  });

  it("is true when a governed write resolves to enforce", () => {
    expect(hasEnforcedWrite([WRITE_TOOL], { GOVERNANCE_TOKEN_MODE: "enforce" })).toBe(true);
  });

  it("ignores reads — only writes carry a decision token", () => {
    expect(hasEnforcedWrite([READ_TOOL], { GOVERNANCE_TOKEN_MODE: "enforce" })).toBe(false);
  });
});

describe("initializeGovernanceRuntime", () => {
  it("returns an in-memory store and does not throw when nothing enforces", async () => {
    const store = await initializeGovernanceRuntime({
      tools: [WRITE_TOOL],
      env: { GOVERNANCE_TOKEN_MODE: "off" },
      logger: logger(),
    });

    expect(store).toBeInstanceOf(InMemoryJtiStore);
    expect(store.distributed).toBe(false);
  });

  it("returns a distributed Firestore store when configured", async () => {
    const store = await initializeGovernanceRuntime({
      tools: [WRITE_TOOL],
      env: {
        GOVERNANCE_TOKEN_MODE: "enforce",
        GOVERNANCE_JTI_STORE: "firestore",
        K_SERVICE: "meta-mcp",
      },
      logger: logger(),
      firestoreFactory: fakeFirestore(),
    });

    expect(store).toBeInstanceOf(FirestoreJtiStore);
    expect(store.distributed).toBe(true);
  });

  it("THROWS AT INIT on hosted enforce with a non-distributed store", async () => {
    await expect(
      initializeGovernanceRuntime({
        tools: [WRITE_TOOL],
        env: { GOVERNANCE_TOKEN_MODE: "enforce", K_SERVICE: "meta-mcp" },
        logger: logger(),
      })
    ).rejects.toThrow(/jti-store misconfiguration/i);
  });

  it("throws when firestore is declared but the store is not distributed", async () => {
    await expect(
      initializeGovernanceRuntime({
        tools: [WRITE_TOOL],
        env: { GOVERNANCE_TOKEN_MODE: "enforce", GOVERNANCE_JTI_STORE: "firestore" },
        logger: logger(),
        // Factory yields a store, but we force selection back to in-memory by
        // simulating the half-wired case via the explicit override below.
        storeOverride: new InMemoryJtiStore(),
      })
    ).rejects.toThrow(/not distributed|never wired/i);
  });

  it("downgrades the throw to a warn under the single-instance opt-out", async () => {
    const log = logger();

    const store = await initializeGovernanceRuntime({
      tools: [WRITE_TOOL],
      env: {
        GOVERNANCE_TOKEN_MODE: "enforce",
        K_SERVICE: "meta-mcp",
        GOVERNANCE_ALLOW_INMEMORY_JTI_UNDER_ENFORCE: "true",
      },
      logger: log,
    });

    expect(store).toBeInstanceOf(InMemoryJtiStore);
    expect(log.warn).toHaveBeenCalled();
  });

  it("warns but does not throw on stdio / self-host enforce", async () => {
    const log = logger();

    await initializeGovernanceRuntime({
      tools: [WRITE_TOOL],
      env: { GOVERNANCE_TOKEN_MODE: "enforce" },
      logger: log,
    });

    expect(log.warn).toHaveBeenCalled();
  });

  it("resolves once per process and returns the same instance", async () => {
    const env = { GOVERNANCE_TOKEN_MODE: "warn" };

    const a = await initializeGovernanceRuntime({ tools: [WRITE_TOOL], env, logger: logger() });
    const b = await initializeGovernanceRuntime({ tools: [WRITE_TOOL], env, logger: logger() });

    expect(a).toBe(b);
  });
});

describe("getGovernanceJtiStore", () => {
  it("is undefined before initialization so the factory can fall back", () => {
    expect(getGovernanceJtiStore()).toBeUndefined();
  });

  it("exposes the initialized store to registerToolsFromDefinitions", async () => {
    const store = await initializeGovernanceRuntime({
      tools: [WRITE_TOOL],
      env: { GOVERNANCE_TOKEN_MODE: "warn" },
      logger: logger(),
    });

    expect(getGovernanceJtiStore()).toBe(store);
  });
});

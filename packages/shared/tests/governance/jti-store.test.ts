// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, it, expect, vi } from "vitest";
import { InMemoryJtiStore, FirestoreJtiStore, selectJtiStore } from "../../src/index.js";
import type { FirestoreLike } from "../../src/index.js";

/** Minimal in-memory fake of the Firestore subset FirestoreJtiStore uses. */
function fakeFirestore(): FirestoreLike {
  const docs = new Set<string>();
  return {
    collection: (name: string) => ({
      doc: (id: string) => ({
        create: async (_data: Record<string, unknown>) => {
          const key = `${name}/${id}`;
          if (docs.has(key)) {
            const err = new Error("ALREADY_EXISTS") as Error & { code: number };
            err.code = 6; // gRPC ALREADY_EXISTS
            throw err;
          }
          docs.add(key);
          return {};
        },
      }),
    }),
  };
}

describe("InMemoryJtiStore", () => {
  it("consumes a jti once, replays thereafter", async () => {
    const s = new InMemoryJtiStore();
    expect(await s.consumeOnce("j1", 1000)).toBe("fresh");
    expect(await s.consumeOnce("j1", 1000)).toBe("replayed");
    expect(await s.consumeOnce("j1", 1000)).toBe("replayed");
  });

  it("tracks distinct jtis independently", async () => {
    const s = new InMemoryJtiStore();
    expect(await s.consumeOnce("a", 1000)).toBe("fresh");
    expect(await s.consumeOnce("b", 1000)).toBe("fresh");
    expect(await s.consumeOnce("a", 1000)).toBe("replayed");
  });

  it("reclaims an expired jti as fresh again", async () => {
    const now = { t: 0 };
    const s = new InMemoryJtiStore(() => now.t);
    expect(await s.consumeOnce("j1", 100)).toBe("fresh");
    now.t = 50;
    expect(await s.consumeOnce("j1", 100)).toBe("replayed"); // still within ttl
    now.t = 101;
    expect(await s.consumeOnce("j1", 100)).toBe("fresh"); // expired -> reclaimable
  });
});

describe("FirestoreJtiStore", () => {
  it("returns fresh on first create, replayed on ALREADY_EXISTS", async () => {
    const s = new FirestoreJtiStore(fakeFirestore());
    expect(await s.consumeOnce("j1", 1000)).toBe("fresh");
    expect(await s.consumeOnce("j1", 1000)).toBe("replayed");
    expect(await s.consumeOnce("j2", 1000)).toBe("fresh");
  });

  it("propagates non-ALREADY_EXISTS errors (does not silently allow the write)", async () => {
    const db: FirestoreLike = {
      collection: () => ({
        doc: () => ({
          create: async () => {
            const err = new Error("UNAVAILABLE") as Error & { code: number };
            err.code = 14;
            throw err;
          },
        }),
      }),
    };
    await expect(new FirestoreJtiStore(db).consumeOnce("j1", 1000)).rejects.toThrow(/UNAVAILABLE/);
  });
});

describe("selectJtiStore", () => {
  it("selects Firestore when configured, via the injected factory", async () => {
    const factory = vi.fn(async () => fakeFirestore());
    const store = await selectJtiStore({
      env: { GOVERNANCE_JTI_STORE: "firestore" },
      firestoreFactory: factory,
    });
    expect(factory).toHaveBeenCalledOnce();
    expect(store).toBeInstanceOf(FirestoreJtiStore);
  });

  it("defaults to in-memory and warns when enforcement is enabled", async () => {
    const warn = vi.fn();
    const store = await selectJtiStore({
      env: {},
      enforcementEnabled: true,
      logger: { warn },
    });
    expect(store).toBeInstanceOf(InMemoryJtiStore);
    expect(warn).toHaveBeenCalledOnce();
  });

  it("defaults to in-memory without warning when enforcement is off", async () => {
    const warn = vi.fn();
    const store = await selectJtiStore({ env: {}, enforcementEnabled: false, logger: { warn } });
    expect(store).toBeInstanceOf(InMemoryJtiStore);
    expect(warn).not.toHaveBeenCalled();
  });
});

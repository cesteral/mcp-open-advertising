// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, it, expect } from "vitest";
import { InMemoryJtiStore } from "../../src/index.js";

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

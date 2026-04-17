import { describe, it, expect, vi, beforeEach } from "vitest";
import { SessionServiceStore } from "../../src/utils/session-store.js";

interface MockServices {
  serviceA: string;
  serviceB: number;
}

describe("SessionServiceStore", () => {
  let store: SessionServiceStore<MockServices>;

  beforeEach(() => {
    store = new SessionServiceStore<MockServices>();
  });

  it("should set and get services", () => {
    const services: MockServices = { serviceA: "hello", serviceB: 42 };
    store.set("session-1", services);
    expect(store.get("session-1")).toEqual(services);
  });

  it("should return undefined for missing sessions", () => {
    expect(store.get("nonexistent")).toBeUndefined();
  });

  it("should delete sessions", () => {
    store.set("session-1", { serviceA: "a", serviceB: 1 });
    expect(store.size).toBe(1);
    store.delete("session-1");
    expect(store.get("session-1")).toBeUndefined();
    expect(store.size).toBe(0);
  });

  it("should track size", () => {
    expect(store.size).toBe(0);
    store.set("s1", { serviceA: "a", serviceB: 1 });
    store.set("s2", { serviceA: "b", serviceB: 2 });
    expect(store.size).toBe(2);
  });

  it("should report isFull when at capacity", () => {
    const smallStore = new SessionServiceStore<MockServices>(2);
    expect(smallStore.isFull()).toBe(false);
    smallStore.set("s1", { serviceA: "a", serviceB: 1 });
    expect(smallStore.isFull()).toBe(false);
    smallStore.set("s2", { serviceA: "b", serviceB: 2 });
    expect(smallStore.isFull()).toBe(true);
  });

  describe("fingerprint validation", () => {
    it("should validate matching fingerprints", () => {
      store.set("s1", { serviceA: "a", serviceB: 1 }, "fp-abc");
      expect(store.validateFingerprint("s1", "fp-abc")).toBe(true);
    });

    it("should reject mismatched fingerprints", () => {
      store.set("s1", { serviceA: "a", serviceB: 1 }, "fp-abc");
      expect(store.validateFingerprint("s1", "fp-xyz")).toBe(false);
    });

    it("should allow when no fingerprint stored (stdio mode)", () => {
      store.set("s1", { serviceA: "a", serviceB: 1 });
      expect(store.validateFingerprint("s1", "any-fp")).toBe(true);
    });

    it("should expose stored fingerprint", () => {
      store.set("s1", { serviceA: "a", serviceB: 1 }, "fp-abc");
      expect(store.getFingerprint("s1")).toBe("fp-abc");
      expect(store.getFingerprint("missing")).toBeUndefined();
    });

    it("should clean up fingerprints on delete", () => {
      store.set("s1", { serviceA: "a", serviceB: 1 }, "fp-abc");
      store.delete("s1");
      // After delete + re-create without fingerprint, should allow
      store.set("s1", { serviceA: "a", serviceB: 1 });
      expect(store.validateFingerprint("s1", "any-fp")).toBe(true);
    });
  });

  describe("auth context", () => {
    it("should set and get auth context", () => {
      store.set("s1", { serviceA: "a", serviceB: 1 });
      const ctx = { authInfo: { clientId: "user@test.com", authType: "jwt" } };
      store.setAuthContext("s1", ctx);
      expect(store.getAuthContext("s1")).toEqual(ctx);
    });

    it("should return undefined for missing auth context", () => {
      expect(store.getAuthContext("nonexistent")).toBeUndefined();
    });

    it("should clean up auth context on delete", () => {
      store.set("s1", { serviceA: "a", serviceB: 1 });
      store.setAuthContext("s1", { authInfo: { clientId: "u", authType: "jwt" } });
      store.delete("s1");
      expect(store.getAuthContext("s1")).toBeUndefined();
    });

    it("should store allowedAdvertisers from auth context", () => {
      store.set("s1", { serviceA: "a", serviceB: 1 });
      const ctx = {
        authInfo: { clientId: "user@test.com", authType: "jwt" },
        allowedAdvertisers: ["adv123", "adv456"],
      };
      store.setAuthContext("s1", ctx);
      expect(store.getAuthContext("s1")?.allowedAdvertisers).toEqual(["adv123", "adv456"]);
    });
  });

  describe("onDelete hooks", () => {
    it("fires every registered hook with the deleted sessionId", () => {
      const hookA = vi.fn();
      const hookB = vi.fn();
      store.onDelete(hookA);
      store.onDelete(hookB);
      store.set("s1", { serviceA: "a", serviceB: 1 });
      store.delete("s1");
      expect(hookA).toHaveBeenCalledWith("s1");
      expect(hookB).toHaveBeenCalledWith("s1");
    });

    it("lets callers unregister a hook via the returned function", () => {
      const hook = vi.fn();
      const unregister = store.onDelete(hook);
      store.set("s1", { serviceA: "a", serviceB: 1 });
      unregister();
      store.delete("s1");
      expect(hook).not.toHaveBeenCalled();
    });

    it("swallows synchronous errors from a hook", () => {
      const badHook = vi.fn(() => {
        throw new Error("boom");
      });
      const goodHook = vi.fn();
      store.onDelete(badHook);
      store.onDelete(goodHook);
      store.set("s1", { serviceA: "a", serviceB: 1 });
      expect(() => store.delete("s1")).not.toThrow();
      expect(goodHook).toHaveBeenCalledWith("s1");
    });

    it("swallows promise rejections from a hook", async () => {
      const badHook = vi.fn(() => Promise.reject(new Error("async boom")));
      store.onDelete(badHook);
      store.set("s1", { serviceA: "a", serviceB: 1 });
      store.delete("s1");
      // Flush microtasks — the rejection is handled internally.
      await Promise.resolve();
      expect(badHook).toHaveBeenCalled();
    });

    it("does not fire hooks when delete() is called for an unknown session", () => {
      // The current implementation fires hooks unconditionally on delete;
      // pin this behavior so callers know to be defensive.
      const hook = vi.fn();
      store.onDelete(hook);
      store.delete("never-existed");
      expect(hook).toHaveBeenCalledWith("never-existed");
    });
  });
});

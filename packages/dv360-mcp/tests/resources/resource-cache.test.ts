import { describe, it, expect, beforeEach } from "vitest";
import { ResourceCache } from "../../src/mcp-server/resources/utils/resource-cache.js";

describe("ResourceCache", () => {
  let cache: ResourceCache;

  beforeEach(() => {
    cache = new ResourceCache();
  });

  // ==========================================================================
  // get / set / has basics
  // ==========================================================================

  describe("get / set / has", () => {
    it("stores and retrieves a value", () => {
      cache.set("key1", "value1");

      expect(cache.get("key1")).toBe("value1");
    });

    it("returns undefined for a missing key", () => {
      expect(cache.get("nonexistent")).toBeUndefined();
    });

    it("has() returns true for existing keys", () => {
      cache.set("key1", "value1");

      expect(cache.has("key1")).toBe(true);
    });

    it("has() returns false for missing keys", () => {
      expect(cache.has("nonexistent")).toBe(false);
    });

    it("overwrites existing values on re-set", () => {
      cache.set("key1", "original");
      cache.set("key1", "updated");

      expect(cache.get("key1")).toBe("updated");
    });

    it("stores multiple independent keys", () => {
      cache.set("a", "alpha");
      cache.set("b", "bravo");
      cache.set("c", "charlie");

      expect(cache.get("a")).toBe("alpha");
      expect(cache.get("b")).toBe("bravo");
      expect(cache.get("c")).toBe("charlie");
    });

    it("handles empty string keys and values", () => {
      cache.set("", "empty-key");
      cache.set("empty-val", "");

      expect(cache.get("")).toBe("empty-key");
      expect(cache.get("empty-val")).toBe("");
      expect(cache.has("")).toBe(true);
      expect(cache.has("empty-val")).toBe(true);
    });
  });

  // ==========================================================================
  // clear
  // ==========================================================================

  describe("clear", () => {
    it("empties the cache completely", () => {
      cache.set("a", "1");
      cache.set("b", "2");

      expect(cache.size).toBe(2);

      cache.clear();

      expect(cache.size).toBe(0);
      expect(cache.has("a")).toBe(false);
      expect(cache.has("b")).toBe(false);
      expect(cache.get("a")).toBeUndefined();
    });

    it("is safe to call on an empty cache", () => {
      cache.clear();
      expect(cache.size).toBe(0);
    });
  });

  // ==========================================================================
  // size
  // ==========================================================================

  describe("size", () => {
    it("returns 0 for a new cache", () => {
      expect(cache.size).toBe(0);
    });

    it("returns correct count after inserts", () => {
      cache.set("a", "1");
      expect(cache.size).toBe(1);

      cache.set("b", "2");
      expect(cache.size).toBe(2);

      cache.set("c", "3");
      expect(cache.size).toBe(3);
    });

    it("does not increment on overwrite of existing key", () => {
      cache.set("a", "1");
      cache.set("a", "2");

      expect(cache.size).toBe(1);
    });

    it("returns 0 after clear", () => {
      cache.set("a", "1");
      cache.set("b", "2");
      cache.clear();

      expect(cache.size).toBe(0);
    });
  });

  // ==========================================================================
  // Cache miss
  // ==========================================================================

  describe("cache miss", () => {
    it("returns undefined for keys that were never set", () => {
      expect(cache.get("missing")).toBeUndefined();
    });

    it("returns undefined for keys that were set then cleared", () => {
      cache.set("temp", "value");
      cache.clear();

      expect(cache.get("temp")).toBeUndefined();
    });
  });
});

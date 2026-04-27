import { describe, expect, it } from "vitest";
import {
  buildReportCsvUri,
  parseReportCsvUri,
  ReportCsvStore,
  REPORT_CSV_RESOURCE_SCHEME,
} from "../../src/utils/report-csv-store.js";

function makeStore(
  opts: {
    ttlMs?: number;
    maxEntries?: number;
    maxBytes?: number;
    startTime?: number;
  } = {}
) {
  let now = opts.startTime ?? 1_000_000;
  let counter = 0;
  const store = new ReportCsvStore({
    ttlMs: opts.ttlMs,
    maxEntries: opts.maxEntries,
    maxBytes: opts.maxBytes,
    now: () => now,
    generateId: () => `id-${++counter}`,
  });
  return {
    store,
    advance(ms: number) {
      now += ms;
    },
  };
}

describe("buildReportCsvUri / parseReportCsvUri", () => {
  it("round-trips a resource id", () => {
    const uri = buildReportCsvUri("abc-123");
    expect(uri).toBe(`${REPORT_CSV_RESOURCE_SCHEME}://abc-123`);
    expect(parseReportCsvUri(uri)).toBe("abc-123");
  });

  it("returns undefined for an unrelated URI", () => {
    expect(parseReportCsvUri("http://example.com")).toBeUndefined();
    expect(parseReportCsvUri("entity-schema://foo")).toBeUndefined();
  });
});

describe("ReportCsvStore", () => {
  it("stores and retrieves CSV entries", () => {
    const { store } = makeStore();
    const entry = store.store({ csv: "a,b\n1,2\n", sessionId: "s-1" });
    expect(entry.resourceId).toBe("id-1");
    expect(entry.byteLength).toBeGreaterThan(0);
    expect(entry.mimeType).toBe("text/csv");

    const got = store.get("id-1");
    expect(got?.csv).toBe("a,b\n1,2\n");
    expect(got?.sessionId).toBe("s-1");
  });

  it("resolves entries by full URI", () => {
    const { store } = makeStore();
    store.store({ csv: "a,b\n1,2\n" });
    expect(store.getByUri(buildReportCsvUri("id-1"))?.csv).toBe("a,b\n1,2\n");
    expect(store.getByUri("nonexistent://oops")).toBeUndefined();
  });

  it("expires entries after TTL", () => {
    const { store, advance } = makeStore({ ttlMs: 1000 });
    store.store({ csv: "x" });
    expect(store.get("id-1")).toBeDefined();
    advance(1500);
    expect(store.get("id-1")).toBeUndefined();
  });

  it("evicts the oldest entry when maxEntries is exceeded", () => {
    const { store, advance } = makeStore({ maxEntries: 2 });
    store.store({ csv: "first" });
    advance(1);
    store.store({ csv: "second" });
    advance(1);
    store.store({ csv: "third" });
    expect(store.size()).toBe(2);
    expect(store.get("id-1")).toBeUndefined();
    expect(store.get("id-2")?.csv).toBe("second");
    expect(store.get("id-3")?.csv).toBe("third");
  });

  it("truncates oversized ASCII CSV bodies under the byte cap", () => {
    const { store } = makeStore({ maxBytes: 100 });
    const big = "abcdefghij".repeat(50);
    const entry = store.store({ csv: big });
    expect(entry.truncated).toBe(true);
    // New byte-aware truncation reserves headroom for the marker so the final
    // body fits inside maxBytes. The previous char-count slice could blow past.
    expect(entry.byteLength).toBeLessThanOrEqual(100);
    expect(entry.warnings.some((w) => w.includes("100 bytes"))).toBe(true);
  });

  it("truncates multi-byte CSV bodies under the byte cap without splitting characters", () => {
    const { store } = makeStore({ maxBytes: 200 });
    // Each emoji is 4 UTF-8 bytes; 200 emoji = 800 bytes.
    const csv = "\u{1F600}".repeat(200);
    const entry = store.store({ csv });

    expect(entry.truncated).toBe(true);
    expect(entry.byteLength).toBeLessThanOrEqual(200);
    // Decoding the stored body must succeed without replacement chars,
    // which would mean the truncation cut a 4-byte char in half.
    expect(entry.csv).not.toContain("\uFFFD");
  });

  it("preserves headroom for the truncation marker so the final body fits", () => {
    const { store } = makeStore({ maxBytes: 50 });
    const csv = "x".repeat(1000);
    const entry = store.store({ csv });

    expect(entry.byteLength).toBeLessThanOrEqual(50);
    expect(entry.csv).toContain("[TRUNCATED");
  });

  it("still enforces the cap when the marker is larger than the budget", () => {
    const { store } = makeStore({ maxBytes: 10 });
    const csv = "x".repeat(1000);
    const entry = store.store({ csv });

    expect(entry.truncated).toBe(true);
    expect(entry.byteLength).toBeLessThanOrEqual(10);
    expect(entry.csv).not.toContain("\uFFFD");
  });

  it("redacts bearer tokens and access_token-style values", () => {
    const { store } = makeStore();
    const csv =
      "header,value\n" +
      'auth,"Bearer eyJhbGciOi.deadbeef"\n' +
      'json,"access_token=secret-token-1"\n';
    const entry = store.store({ csv });
    expect(entry.csv).toContain("[REDACTED]");
    expect(entry.csv).not.toContain("eyJhbGciOi.deadbeef");
    expect(entry.csv).not.toContain("secret-token-1");
  });

  it("clears entries by sessionId", () => {
    const { store } = makeStore();
    store.store({ csv: "one", sessionId: "s-1" });
    store.store({ csv: "two", sessionId: "s-2" });
    store.store({ csv: "three", sessionId: "s-1" });

    const removed = store.clearForSession("s-1");
    expect(removed).toBe(2);
    expect(store.size()).toBe(1);
    expect(store.list()[0]?.sessionId).toBe("s-2");
  });

  it("list() returns only non-expired entries", () => {
    const { store, advance } = makeStore({ ttlMs: 1000 });
    store.store({ csv: "one" });
    advance(1500);
    store.store({ csv: "two" });
    const entries = store.list();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.resourceId).toBe("id-2");
  });
});

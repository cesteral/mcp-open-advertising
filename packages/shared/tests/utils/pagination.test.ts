// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, it, expect } from "vitest";
import {
  buildPaginationOutput,
  formatPaginationHint,
  PaginationOutputSchema,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from "../../src/utils/pagination.js";

describe("buildPaginationOutput", () => {
  it("returns hasMore=true with cursor when one is supplied", () => {
    const out = buildPaginationOutput({
      nextCursor: "abc123",
      pageSize: 25,
      nextPageInputKey: "after",
    });
    expect(out).toEqual({
      nextCursor: "abc123",
      hasMore: true,
      pageSize: 25,
      nextPageInputKey: "after",
    });
  });

  it("normalizes undefined cursor to null and hasMore=false", () => {
    const out = buildPaginationOutput({
      nextCursor: undefined,
      pageSize: 0,
      nextPageInputKey: "pageToken",
    });
    expect(out.nextCursor).toBeNull();
    expect(out.hasMore).toBe(false);
  });

  it("normalizes null cursor to hasMore=false", () => {
    const out = buildPaginationOutput({
      nextCursor: null,
      pageSize: 10,
      nextPageInputKey: "bookmark",
    });
    expect(out.hasMore).toBe(false);
  });

  it("treats empty-string cursor as exhausted", () => {
    const out = buildPaginationOutput({
      nextCursor: "",
      pageSize: 10,
      nextPageInputKey: "cursor",
    });
    expect(out.hasMore).toBe(false);
  });

  it("includes totalCount when provided", () => {
    const out = buildPaginationOutput({
      nextCursor: "x",
      pageSize: 50,
      totalCount: 1234,
      nextPageInputKey: "pageToken",
    });
    expect(out.totalCount).toBe(1234);
  });

  it("supports offset-based platforms by stringifying the next offset", () => {
    const out = buildPaginationOutput({
      nextCursor: "50",
      pageSize: 50,
      nextPageInputKey: "startIndex",
    });
    expect(out.nextCursor).toBe("50");
    expect(out.nextPageInputKey).toBe("startIndex");
    expect(out.hasMore).toBe(true);
  });

  it("emits an output that conforms to PaginationOutputSchema", () => {
    const out = buildPaginationOutput({
      nextCursor: "abc",
      pageSize: 10,
      totalCount: 100,
      nextPageInputKey: "after",
    });
    expect(() => PaginationOutputSchema.parse(out)).not.toThrow();
  });
});

describe("formatPaginationHint", () => {
  it("returns empty string when hasMore is false", () => {
    expect(
      formatPaginationHint({
        nextCursor: null,
        hasMore: false,
        pageSize: 10,
        nextPageInputKey: "after",
      })
    ).toBe("");
  });

  it("renders the platform-native input key in the hint", () => {
    const text = formatPaginationHint({
      nextCursor: "abc123",
      hasMore: true,
      pageSize: 25,
      nextPageInputKey: "after",
    });
    expect(text).toContain("after");
    expect(text).toContain('"abc123"');
  });

  it("JSON-encodes cursors that include special characters", () => {
    const text = formatPaginationHint({
      nextCursor: 'has "quotes" and \\backslashes',
      hasMore: true,
      pageSize: 1,
      nextPageInputKey: "pageToken",
    });
    // JSON.stringify escapes both
    expect(text).toContain('"has \\"quotes\\" and \\\\backslashes"');
  });
});

describe("constants", () => {
  it("DEFAULT_PAGE_SIZE is 50 and MAX_PAGE_SIZE is 200", () => {
    expect(DEFAULT_PAGE_SIZE).toBe(50);
    expect(MAX_PAGE_SIZE).toBe(200);
  });
});

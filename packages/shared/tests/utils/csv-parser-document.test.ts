// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, expect, it } from "vitest";
import { parseCSV } from "../../src/utils/csv-parser.js";

describe("parseCSV", () => {
  it("parses headers and rows", () => {
    const out = parseCSV("a,b,c\n1,2,3\n4,5,6\n");
    expect(out.headers).toEqual(["a", "b", "c"]);
    expect(out.rows).toEqual([
      { a: "1", b: "2", c: "3" },
      { a: "4", b: "5", c: "6" },
    ]);
  });

  it("normalizes CRLF to LF", () => {
    const out = parseCSV("a,b\r\n1,2\r\n");
    expect(out.rows).toEqual([{ a: "1", b: "2" }]);
  });

  it("handles quoted fields with embedded commas and newlines", () => {
    const out = parseCSV('a,b\n"hello, world","line1\nline2"\n');
    expect(out.rows[0]).toEqual({ a: "hello, world", b: "line1\nline2" });
  });

  it("returns empty rows when body is blank", () => {
    const out = parseCSV("a,b\n");
    expect(out.rows).toEqual([]);
  });

  it("skips empty trailing lines", () => {
    const out = parseCSV("a\n1\n\n\n");
    expect(out.rows).toEqual([{ a: "1" }]);
  });

  it("strips a leading UTF-8 BOM", () => {
    const out = parseCSV("\uFEFFa,b\n1,2\n");
    expect(out.headers).toEqual(["a", "b"]);
    expect(out.rows).toEqual([{ a: "1", b: "2" }]);
  });
});

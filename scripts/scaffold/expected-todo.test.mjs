// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expectedTodoFailures, expectedTodoTools } from "./expected-todo.mjs";

const WIRE_TEST = join(import.meta.dirname, "../lib/wire-request-coverage.test.mjs");
const CONFIRMATION_TEST = join(import.meta.dirname, "../lib/irreversible-confirmation.test.mjs");

/** The vitest full name of a ratchet's per-package case, rebuilt from its own titles. */
function caseName(file, describePrefix, pkg) {
  const source = readFileSync(file, "utf8");
  const describeTitle = source.match(new RegExp(`describe\\("(${describePrefix}[^"]+)"`))[1];
  const itTitle = source.match(/it\.each\(packages\)\(\s*"(%s: [^"]+)"/)[1];
  return `${describeTitle} ${itTitle.replace("%s", pkg)}`;
}

describe("scaffold: the to-do failures a fresh server is allowed", () => {
  it("a read-only server is allowed none", () => {
    expect(expectedTodoFailures("xy")).toEqual([]);
    expect(expectedTodoTools("xy")).toEqual([]);
  });

  it("names match the ratchets' case names", () => {
    // Rebuild the vitest full names from the tests' own describe/it.each titles,
    // so renaming either test fails here instead of silently breaking the smoke.
    expect(expectedTodoFailures("xy", { writes: true })).toEqual([
      caseName(WIRE_TEST, "every write tool", "xy-mcp"),
      caseName(CONFIRMATION_TEST, "every destructive or terminal tool", "xy-mcp"),
    ]);
  });

  it("a type with no terminal stub expects no irreversible-confirmation failure", () => {
    expect(expectedTodoFailures("xy", { type: "reporting", writes: true })).toEqual([
      caseName(WIRE_TEST, "every write tool", "xy-mcp"),
    ]);
  });

  it("the failure is for exactly the four write stubs", () => {
    expect(expectedTodoTools("foo_bar", { writes: true })).toEqual([
      "foo_bar_create_entity",
      "foo_bar_update_entity",
      "foo_bar_delete_entity",
      "foo_bar_bulk_update_status",
    ]);
  });
});

// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expectedTodoFailures, expectedTodoTools } from "./expected-todo.mjs";

const WIRE_TEST = join(import.meta.dirname, "../lib/wire-request-coverage.test.mjs");

describe("scaffold: the to-do failures a fresh server is allowed", () => {
  it("names match the wire-coverage test's case names", () => {
    // Rebuild the vitest full name from the test's own describe/it.each titles,
    // so renaming that test fails here instead of silently breaking the smoke.
    const source = readFileSync(WIRE_TEST, "utf8");
    const describeTitle = source.match(/describe\("(every write tool[^"]+)"/)[1];
    const itTitle = source.match(/it\.each\(packages\)\("(%s: [^"]+)"/)[1];
    expect(expectedTodoFailures("xy")).toEqual([
      `${describeTitle} ${itTitle.replace("%s", "xy-mcp")}`,
    ]);
  });

  it("the failure is for exactly the four write stubs", () => {
    expect(expectedTodoTools("foo_bar")).toEqual([
      "foo_bar_create_entity",
      "foo_bar_update_entity",
      "foo_bar_delete_entity",
      "foo_bar_bulk_update_status",
    ]);
  });
});

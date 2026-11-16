// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.

import { describe, expect, it } from "vitest";
import { failuresFromReport } from "./report.mjs";

const file = (name, status, assertionResults, message = "") => ({
  name,
  status,
  message,
  assertionResults,
});
const test = (fullName, status, failureMessages = []) => ({ fullName, status, failureMessages });

describe("scaffold smoke: reading the vitest report", () => {
  it("lists each failed test by full name", () => {
    const failed = failuresFromReport({
      testResults: [
        file("a.test.mjs", "failed", [test("A ok", "passed"), test("A bad", "failed", ["boom"])]),
      ],
    });
    expect([...failed]).toEqual([["A bad", "boom"]]);
  });

  it("a file whose hook failed (every test skipped) is a failure, not a pass", () => {
    // vitest 5: a throwing beforeAll marks the file failed and skips its tests,
    // with no failed assertion. The routing evals do their work in hooks.
    const failed = failuresFromReport({
      testResults: [
        file("evals/cross-server-routing.test.mjs", "failed", [
          test("baseline", "skipped"),
          test("prefix invariant", "skipped"),
        ]),
      ],
    });
    expect([...failed.keys()]).toEqual(["evals/cross-server-routing.test.mjs (file failed)"]);
  });

  it("a file that failed to load is a failure", () => {
    const failed = failuresFromReport({
      testResults: [file("b.test.mjs", "failed", [], "SyntaxError")],
    });
    expect([...failed]).toEqual([["b.test.mjs (file failed)", "SyntaxError"]]);
  });
});

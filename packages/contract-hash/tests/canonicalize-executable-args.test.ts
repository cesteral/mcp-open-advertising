// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, it, expect } from "vitest";
import { canonicalizeExecutableArgs, hashActionInput } from "../src/index.js";

describe("canonicalizeExecutableArgs", () => {
  it("strips top-level control fields before hashing", () => {
    const raw = { customerId: "1", entityId: "2", data: { status: "PAUSED" }, dry_run: true };
    const canon = canonicalizeExecutableArgs({ rawArgs: raw, exclude: ["dry_run"] });
    expect(canon).toEqual({ customerId: "1", entityId: "2", data: { status: "PAUSED" } });
  });
  it("ALSO strips __-prefixed internal execution args (mirrors governance stripInternalExecutionArgs)", () => {
    const raw = { entityId: "2", __traceId: "t", __agent: "a", status: "PAUSED" };
    expect(canonicalizeExecutableArgs({ rawArgs: raw, exclude: [] })).toEqual({
      entityId: "2",
      status: "PAUSED",
    });
  });
  it("leaves non-control, non-__ args untouched", () => {
    const raw = { a: 1, b: 2 };
    expect(canonicalizeExecutableArgs({ rawArgs: raw, exclude: [] })).toEqual(raw);
  });
  it("produces an order-invariant hash", () => {
    const a = canonicalizeExecutableArgs({
      rawArgs: { b: 2, a: 1, dry_run: false },
      exclude: ["dry_run"],
    });
    const b = canonicalizeExecutableArgs({ rawArgs: { a: 1, b: 2 }, exclude: [] });
    expect(hashActionInput(a)).toBe(hashActionInput(b));
  });
  it("returns non-object args unchanged", () => {
    expect(canonicalizeExecutableArgs({ rawArgs: "x", exclude: ["dry_run"] })).toBe("x");
    expect(canonicalizeExecutableArgs({ rawArgs: [1, 2], exclude: ["dry_run"] })).toEqual([1, 2]);
    expect(canonicalizeExecutableArgs({ rawArgs: null, exclude: ["dry_run"] })).toBeNull();
  });
});

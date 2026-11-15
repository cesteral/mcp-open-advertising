// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, expect, it } from "vitest";
import {
  get{{Pascal}}AccountIdFromHeaders,
  get{{Pascal}}CredentialFingerprint,
  parse{{Pascal}}TokenFromHeaders,
} from "../src/auth/{{key}}-auth-adapter.js";

describe("{{package}} auth headers and fingerprint", () => {
  it("reads the bearer token and the account header", () => {
    const headers = { authorization: "Bearer tok-1", "X-{{Pascal}}-Account-Id": "acct-1" };
    expect(parse{{Pascal}}TokenFromHeaders(headers)).toBe("tok-1");
    expect(get{{Pascal}}AccountIdFromHeaders(headers)).toBe("acct-1");
  });

  it("rejects a missing token or account", () => {
    expect(() => parse{{Pascal}}TokenFromHeaders({})).toThrow(/Authorization/);
    expect(() => get{{Pascal}}AccountIdFromHeaders({})).toThrow(/Account-Id/);
  });

  it("binds the session to both the token and the account", () => {
    const a = get{{Pascal}}CredentialFingerprint("tok-1", "acct-1");
    expect(get{{Pascal}}CredentialFingerprint("tok-1", "acct-1")).toBe(a);
    expect(get{{Pascal}}CredentialFingerprint("tok-1", "acct-2")).not.toBe(a);
    expect(get{{Pascal}}CredentialFingerprint("tok-2", "acct-1")).not.toBe(a);
  });
});

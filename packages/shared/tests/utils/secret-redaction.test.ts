// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Shared secret redaction — sweep 2026-07-25, 02-F5/F6/F7.
 *
 * Two copies of "strip secrets from a string" had drifted apart:
 *
 *  - `http-request-recorder.ts` had the maintained one — JSON `"k":"v"` AND
 *    form/query `k=v`, optional quotes, `developer[_-]?token` both spellings —
 *    plus `redactUrl`.
 *  - `mcp-errors.ts` had a weaker one: JSON-quoted keys only.
 *
 * Measured against the four shapes these actually see, the weak set caught ONE.
 * It missed `?access_token=…` in a URL, `client_secret=…&…` in an OAuth2 refresh
 * body (which is `x-www-form-urlencoded`, so a `":"`-anchored pattern misses it
 * entirely), and `"developer-token"` in JSON.
 *
 * Separately (02-F5), `sanitizeErrorData` applied even the weak set only to
 * `data` values, while `errorMessage` — which carries the same bytes, because
 * clients build messages by interpolating the failing URL or response body — went
 * to the interaction log verbatim.
 */

import { describe, it, expect } from "vitest";
import {
  redactSecretsInString,
  redactSecretsInText,
  redactUrl,
} from "../../src/utils/secret-redaction.js";
import { ErrorHandler } from "../../src/utils/mcp-errors.js";

/** The four shapes the fleet's clients actually produce. */
const SHAPES = [
  {
    name: "credential in a URL query string (Meta Graph)",
    input: "Request failed: https://graph.facebook.com/v21.0/me?access_token=EAAG_SECRET_1",
    secret: "EAAG_SECRET_1",
  },
  {
    name: "form-urlencoded OAuth2 refresh body",
    input: "client_secret=SUPERSECRET&grant_type=refresh_token",
    secret: "SUPERSECRET",
  },
  {
    name: "hyphenated developer-token in JSON",
    input: '{"developer-token": "DEV_SECRET"}',
    secret: "DEV_SECRET",
  },
  {
    name: "JSON refresh_token (the one the weak set already caught)",
    input: 'TTD rejected: {"refresh_token":"RT_SECRET"}',
    secret: "RT_SECRET",
  },
];

describe("redactSecretsInText covers every shape", () => {
  for (const { name, input, secret } of SHAPES) {
    it(`redacts ${name}`, () => {
      expect(redactSecretsInText(input)).not.toContain(secret);
    });
  }

  it("leaves the non-secret parts intact, so the message stays diagnosable", () => {
    const out = redactSecretsInText(SHAPES[0].input);
    expect(out).toContain("graph.facebook.com");
    expect(out).toContain("/v21.0/me");
  });

  it("redacts a URL param the body patterns do not enumerate", () => {
    // `redactUrl` matches param names by substring, so it catches `sig` /
    // `apikey` shapes the key-list patterns never name. Running both is the
    // point of redactSecretsInText.
    const out = redactSecretsInText("failed: https://api.example.com/x?signature=SIG_SECRET");
    expect(out).not.toContain("SIG_SECRET");
  });

  it("passes through a message with nothing to redact", () => {
    expect(redactSecretsInText("Campaign 12345 not found")).toBe("Campaign 12345 not found");
  });

  it("leaves a benign `key` query param alone", () => {
    // Pinned: the URL param list is deliberately narrower than the header list
    // so `?key=primary` is not clobbered.
    expect(redactUrl("https://api.example.com/x?key=primary")).toBe(
      "https://api.example.com/x?key=primary"
    );
  });
});

describe("redactSecretsInString (bare patterns, no URL pass)", () => {
  it("still handles bearer tokens", () => {
    expect(redactSecretsInString("Authorization: Bearer abc.def-123")).toBe(
      "Authorization: Bearer [REDACTED]"
    );
  });
});

describe("ErrorHandler.sanitizeErrorData now uses the shared set", () => {
  it("redacts a credential-bearing url on error data", () => {
    const out = ErrorHandler.sanitizeErrorData({
      url: "https://graph.facebook.com/v21.0/me?access_token=EAAG_SECRET_1",
      status: 401,
    });
    expect(JSON.stringify(out)).not.toContain("EAAG_SECRET_1");
    // Non-secret fields survive — the record has to stay useful.
    expect(out?.status).toBe(401);
  });

  it("redacts a form-urlencoded errorBody the old pattern missed", () => {
    const out = ErrorHandler.sanitizeErrorData({
      errorBody: "client_secret=SUPERSECRET&grant_type=refresh_token",
    });
    expect(JSON.stringify(out)).not.toContain("SUPERSECRET");
  });

  it("still redacts by key name", () => {
    const out = ErrorHandler.sanitizeErrorData({ access_token: "RAW" });
    expect(out?.access_token).toBe("[REDACTED]");
  });
});

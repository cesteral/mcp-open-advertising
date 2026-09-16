// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * #204 Tier 1. These tests pin the two properties that make the declaration
 * worth publishing at all — that it states an OBLIGATION rather than a warning,
 * and that "we do not report which paths" stays distinguishable from "there is
 * no untrusted content here".
 *
 * They are deliberately about meaning, not wording. A future edit may reword any
 * sentence; what it must not do is quietly turn the declaration into a
 * reassurance.
 */

import { describe, it, expect } from "vitest";
import {
  UNTRUSTED_CONTENT_DECLARATION as D,
  type UntrustedContentDeclaration,
} from "../../src/utils/untrusted-content.js";

describe("UNTRUSTED_CONTENT_DECLARATION", () => {
  it("declares that third-party content is returned", () => {
    // Every server in this fleet returns operator-authored free text. A server
    // that ever declares `false` here is claiming something much stronger than
    // "we did not find any".
    expect(D.returns_third_party_content).toBe(true);
  });

  it("does not report per-path provenance, and says so explicitly", () => {
    // The distinction the issue calls out: a client that reads a missing
    // `_untrustedPaths` as "nothing untrusted here" has inverted the meaning.
    // Tier 2 is unimplemented, so this must stay `unsupported` — not absent.
    expect(D.path_reporting).toBe("unsupported");
    expect(D).toHaveProperty("path_reporting");
  });

  it("states obligations as actions a client must take, not as advice", () => {
    expect(D.client_obligations.length).toBeGreaterThanOrEqual(3);

    // The load-bearing one: content must never drive a subsequent call on its
    // own. Asserted by meaning — an obligation mentioning tool calls and human
    // review must survive rewording.
    const drivesCalls = D.client_obligations.some(
      (o) => /tool call/i.test(o) && /human review/i.test(o)
    );
    expect(drivesCalls).toBe(true);

    const dataNotInstructions = D.client_obligations.some(
      (o) => /\bdata\b/i.test(o) && /\binstructions?\b/i.test(o)
    );
    expect(dataNotInstructions).toBe(true);
  });

  it("names where the content comes from, so the obligation is actionable", () => {
    // "Untrusted" without a source is unactionable. An operator has to know the
    // audited account's own staff can author this.
    expect(D.origin).toMatch(/advertising platform/i);
    expect(D.origin).toMatch(/third party/i);
  });

  it("never claims the boundary is enforced", () => {
    // No server-side change stops a model following injected instructions. The
    // declaration must not drift into implying otherwise — that would be worse
    // than publishing nothing, because a client could rely on it.
    const prose = [D.origin, ...D.client_obligations].join(" ");
    expect(prose).not.toMatch(/\b(prevent|block|sanitiz|strip|filter|guarantee)/i);
  });

  it("is a complete UntrustedContentDeclaration", () => {
    const typed: UntrustedContentDeclaration = D;
    expect(Object.keys(typed).sort()).toEqual([
      "client_obligations",
      "origin",
      "path_reporting",
      "returns_third_party_content",
    ]);
  });
});

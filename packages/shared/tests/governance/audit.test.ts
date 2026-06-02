// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, it, expect, vi } from "vitest";
import { logDecisionTokenVerdict } from "../../src/index.js";
import type { DecisionTokenVerdict } from "../../src/index.js";

function fakeLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

describe("logDecisionTokenVerdict", () => {
  it("logs a success verdict at info with audit fields and no raw token", () => {
    const logger = fakeLogger();
    const verdict: DecisionTokenVerdict = {
      ok: true,
      reasonCode: "OK",
      claims: { sub: "tenant-1", contractId: "meta.update_entity.v1", jti: "j1" },
    };
    logDecisionTokenVerdict(logger, {
      verdict,
      mode: "enforce",
      contractId: "meta.update_entity.v1",
      toolName: "meta_update_entity",
    });

    expect(logger.info).toHaveBeenCalledOnce();
    const [obj] = logger.info.mock.calls[0];
    expect(obj).toMatchObject({
      component: "governance-audit",
      status: "ok",
      reasonCode: "OK",
      mode: "enforce",
      contractId: "meta.update_entity.v1",
      toolName: "meta_update_entity",
      sub: "tenant-1",
      jti: "j1",
    });
    // No raw token / secret material in the audit record.
    expect(obj).not.toHaveProperty("token");
    expect(obj).not.toHaveProperty("decisionToken");
    expect(obj).not.toHaveProperty("secret");
  });

  it("logs a rejection at warn with the reason code and detail", () => {
    const logger = fakeLogger();
    const verdict: DecisionTokenVerdict = {
      ok: false,
      reasonCode: "MISSING_CLAIM",
      detail: "jti",
      claims: { sub: "tenant-2" },
    };
    logDecisionTokenVerdict(logger, {
      verdict,
      mode: "warn",
      contractId: "meta.update_entity.v1",
      toolName: "meta_update_entity",
    });

    expect(logger.warn).toHaveBeenCalledOnce();
    const [obj] = logger.warn.mock.calls[0];
    expect(obj).toMatchObject({
      status: "rejected",
      reasonCode: "MISSING_CLAIM",
      detail: "jti",
      mode: "warn",
      sub: "tenant-2",
    });
  });
});

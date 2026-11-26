// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * The `governance-audit` record `confirmDestructive` emits per decision:
 * one per outcome, the call's scope from the request context, nothing secret.
 * The 2026-era multi-round case (exactly one record across rounds) is in
 * `confirmation-rounds.test.ts`, which drives the real factory.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  elicitArchiveConfirmation,
  elicitBulkStatusChangeConfirmation,
  elicitDeleteConfirmation,
  type ElicitContext,
} from "../../src/utils/mcp/elicitation-helpers.js";
import {
  runWithRequestContext,
  createRequestContext,
} from "../../src/utils/observability/request-context.js";
import {
  logDestructiveConfirmation,
  type ConfirmationAuditScope,
} from "../../src/governance/audit.js";

const ENV_KEY = "MCP_ELICIT_DESTRUCTIVE";
const originalEnv = process.env[ENV_KEY];

function fakeLogger() {
  return { info: vi.fn(), warn: vi.fn() };
}

type FakeLogger = ReturnType<typeof fakeLogger>;

/** Every `destructive_confirmation` record the logger received, at either level. */
function records(logger: FakeLogger): Array<{ level: string; obj: Record<string, unknown> }> {
  const out: Array<{ level: string; obj: Record<string, unknown> }> = [];
  for (const level of ["info", "warn"] as const) {
    for (const [obj] of logger[level].mock.calls) {
      if ((obj as { event?: string }).event === "destructive_confirmation") {
        out.push({ level, obj: obj as Record<string, unknown> });
      }
    }
  }
  return out;
}

function scope(logger: FakeLogger, extra: Partial<ConfirmationAuditScope> = {}) {
  return {
    logger,
    toolName: "dv360_delete_entity",
    argsDigest: "d".repeat(64),
    principalTag: "tag-1",
    ...extra,
  } satisfies ConfirmationAuditScope;
}

/** Run `fn` inside a request context carrying the factory's audit scope. */
function inScope<T>(s: ConfirmationAuditScope, fn: () => Promise<T>): Promise<T> {
  const ctx = createRequestContext("test");
  ctx.confirmationAudit = s;
  return runWithRequestContext(ctx, fn);
}

const answering = (answer: Record<string, unknown>): ElicitContext => ({
  elicitInput: async () => answer,
});

beforeEach(() => {
  delete process.env[ENV_KEY];
});
afterEach(() => {
  if (originalEnv === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = originalEnv;
  vi.restoreAllMocks();
});

describe("destructive_confirmation audit record", () => {
  it("accepted: one info record with the call's scope", async () => {
    const logger = fakeLogger();
    // A verified token without an `approvalId` (a machine caller admitted by
    // policy): the user is still asked, and the record carries the jti.
    const ok = await inScope(scope(logger, { jti: "jti-1" }), () =>
      elicitDeleteConfirmation({
        entityLabel: "campaign",
        entityId: "123",
        sdkContext: answering({ action: "accept", content: { confirm: true } }),
      })
    );
    expect(ok).toBe(true);
    const recs = records(logger);
    expect(recs).toHaveLength(1);
    expect(recs[0].level).toBe("info");
    expect(recs[0].obj).toEqual({
      component: "governance-audit",
      event: "destructive_confirmation",
      outcome: "accepted",
      action: "You are about to delete campaign 123.",
      irreversible: true,
      toolName: "dv360_delete_entity",
      argsDigest: "d".repeat(64),
      principalTag: "tag-1",
      jti: "jti-1",
      approvalId: undefined,
    });
  });

  it("approved_by_governance: a verified approval is the confirmation, nobody is asked", async () => {
    const logger = fakeLogger();
    const elicitInput = vi.fn();
    const ok = await inScope(scope(logger, { jti: "jti-1", approvalId: "appr-1" }), () =>
      elicitDeleteConfirmation({
        entityLabel: "campaign",
        entityId: "123",
        sdkContext: { elicitInput },
      })
    );
    expect(ok).toBe(true);
    expect(elicitInput).not.toHaveBeenCalled();
    const recs = records(logger);
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({
      level: "info",
      obj: {
        outcome: "approved_by_governance",
        irreversible: true,
        jti: "jti-1",
        approvalId: "appr-1",
      },
    });
  });

  it("approved_by_governance also holds with no elicitation channel, for reversible ops too", async () => {
    const logger = fakeLogger();
    const s = scope(logger, { jti: "jti-2", approvalId: "appr-2" });
    expect(
      await inScope(s, () => elicitArchiveConfirmation({ count: 1, entityLabel: "campaign" }))
    ).toBe(true);
    expect(
      await inScope(s, () =>
        elicitBulkStatusChangeConfirmation({ count: 3, entityLabel: "ad", targetStatus: "PAUSED" })
      )
    ).toBe(true);
    expect(records(logger).map((r) => [r.obj.outcome, r.obj.irreversible])).toEqual([
      ["approved_by_governance", true],
      ["approved_by_governance", false],
    ]);
  });

  it("no approval skip on a dry run, without a jti, or with an empty approvalId", async () => {
    for (const extra of [
      { jti: "jti-3", approvalId: "appr-3", dryRun: true },
      { approvalId: "appr-3" },
      { jti: "jti-3", approvalId: "" },
    ]) {
      const logger = fakeLogger();
      const ok = await inScope(scope(logger, extra), () =>
        elicitArchiveConfirmation({ count: 1, entityLabel: "campaign" })
      );
      expect(ok).toBe(false);
      expect(records(logger).map((r) => r.obj.outcome)).toEqual(["refused_no_channel"]);
    }
  });

  it("MCP_ELICIT_DESTRUCTIVE=skip is still evaluated first", async () => {
    process.env[ENV_KEY] = "skip";
    const logger = fakeLogger();
    await inScope(scope(logger, { jti: "jti-4", approvalId: "appr-4" }), () =>
      elicitDeleteConfirmation({ entityLabel: "campaign", entityId: "1" })
    );
    expect(records(logger).map((r) => r.obj.outcome)).toEqual(["skipped_by_env"]);
  });

  it("outside a factory scope there is no approval to honour", async () => {
    const ok = await elicitArchiveConfirmation({ count: 1, entityLabel: "campaign" });
    expect(ok).toBe(false);
  });

  it("declined: an explicit decline", async () => {
    const logger = fakeLogger();
    const ok = await inScope(scope(logger), () =>
      elicitDeleteConfirmation({
        entityLabel: "campaign",
        entityId: "123",
        sdkContext: answering({ action: "decline" }),
      })
    );
    expect(ok).toBe(false);
    expect(records(logger).map((r) => r.obj.outcome)).toEqual(["declined"]);
  });

  it("declined: accepting the form without ticking the box", async () => {
    const logger = fakeLogger();
    const ok = await inScope(scope(logger), () =>
      elicitDeleteConfirmation({
        entityLabel: "campaign",
        entityId: "123",
        sdkContext: answering({ action: "accept", content: { confirm: false } }),
      })
    );
    expect(ok).toBe(false);
    expect(records(logger).map((r) => r.obj.outcome)).toEqual(["declined"]);
  });

  it("cancelled", async () => {
    const logger = fakeLogger();
    const ok = await inScope(scope(logger), () =>
      elicitDeleteConfirmation({
        entityLabel: "campaign",
        entityId: "123",
        sdkContext: answering({ action: "cancel" }),
      })
    );
    expect(ok).toBe(false);
    expect(records(logger).map((r) => r.obj.outcome)).toEqual(["cancelled"]);
  });

  it("refused_no_channel: an irreversible op with no elicitation channel, at warn", async () => {
    const logger = fakeLogger();
    const ok = await inScope(scope(logger), () =>
      elicitArchiveConfirmation({ count: 2, entityLabel: "campaign", sdkContext: {} })
    );
    expect(ok).toBe(false);
    const recs = records(logger);
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({
      level: "warn",
      obj: { outcome: "refused_no_channel", irreversible: true, toolName: "dv360_delete_entity" },
    });
  });

  it("allowed_no_channel: a reversible op with no channel goes ahead, and says so", async () => {
    const logger = fakeLogger();
    const ok = await inScope(scope(logger), () =>
      elicitBulkStatusChangeConfirmation({
        count: 3,
        entityLabel: "line item",
        targetStatus: "PAUSED",
      })
    );
    expect(ok).toBe(true);
    const recs = records(logger);
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({
      level: "info",
      obj: { outcome: "allowed_no_channel", irreversible: false },
    });
  });

  it("skipped_by_env: MCP_ELICIT_DESTRUCTIVE=skip leaves a warn record, nobody is asked", async () => {
    process.env[ENV_KEY] = "skip";
    const logger = fakeLogger();
    const elicitInput = vi.fn();
    const ok = await inScope(scope(logger), () =>
      elicitDeleteConfirmation({
        entityLabel: "campaign",
        entityId: "9",
        sdkContext: { elicitInput },
      })
    );
    expect(ok).toBe(true);
    expect(elicitInput).not.toHaveBeenCalled();
    const recs = records(logger);
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({
      level: "warn",
      obj: { outcome: "skipped_by_env", irreversible: true },
    });
  });

  it("an answer carried from an earlier round is not recorded again", async () => {
    const logger = fakeLogger();
    const ok = await inScope(scope(logger, { isCarriedAnswer: () => true }), () =>
      elicitDeleteConfirmation({
        entityLabel: "campaign",
        entityId: "123",
        sdkContext: answering({ action: "accept", content: { confirm: true } }),
      })
    );
    expect(ok).toBe(true);
    expect(records(logger)).toHaveLength(0);
  });

  it("a round that only asks (elicitInput throws) records nothing", async () => {
    const logger = fakeLogger();
    const asking: ElicitContext = {
      elicitInput: async () => {
        throw new Error("input required");
      },
    };
    await expect(
      inScope(scope(logger), () =>
        elicitDeleteConfirmation({ entityLabel: "campaign", entityId: "1", sdkContext: asking })
      )
    ).rejects.toThrow("input required");
    expect(records(logger)).toHaveLength(0);
  });

  it("redacts secret-shaped text in the action and never carries raw arguments", async () => {
    const logger = fakeLogger();
    await inScope(scope(logger), () =>
      elicitDeleteConfirmation({
        entityLabel: "campaign",
        entityId: "123",
        entityName: "access_token=abc123secret",
        sdkContext: answering({ action: "decline" }),
      })
    );
    const [rec] = records(logger);
    expect(String(rec.obj.action)).not.toContain("abc123secret");
    expect(rec.obj).not.toHaveProperty("args");
    expect(rec.obj).not.toHaveProperty("params");
    expect(rec.obj).not.toHaveProperty("token");
    expect(rec.obj).not.toHaveProperty("decisionToken");
  });

  it("outside a factory scope it still records the action and outcome", async () => {
    const logger = fakeLogger();
    logDestructiveConfirmation(logger, {
      action: "You are about to delete campaign 1.",
      outcome: "declined",
      irreversible: true,
    });
    expect(records(logger)[0].obj).toMatchObject({
      outcome: "declined",
      toolName: undefined,
      jti: undefined,
    });
  });
});

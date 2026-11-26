// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Terminal status transitions are confirmed as irreversible.
 *
 * A bulk status change used to be confirmed as reversible whatever its target,
 * so a client with no elicitation channel archived (DV360), removed (Google Ads)
 * or deleted (TikTok) a batch unconfirmed (`allowed_no_channel`), and the
 * update / bulk-mutate tools that can set the same values asked nothing at all.
 * The terminal values come from registry.json (`terminalStatusValues`); these
 * tests pin the shared half: the lookup, the payload scan, the helpers, the
 * audit record and the B6 skip.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import pino from "pino";
import {
  elicitBulkStatusChangeConfirmation,
  elicitBulkMutationConfirmation,
  elicitTerminalTransitionConfirmation,
  elicitIrreversibleOperationConfirmation,
  assertTerminalTransitionsConfirmed,
  findTerminalTransitions,
  type ElicitContext,
} from "../../src/utils/mcp/elicitation-helpers.js";
import {
  terminalStatusValuesFor,
  isTerminalStatusValue,
  findTerminalStatusValues,
  restrictToUpdateMask,
} from "../../src/utils/mcp/terminal-values.js";
import { REGISTRY_DATA } from "../../src/utils/transport/registry-data.generated.js";
import {
  runWithRequestContext,
  createRequestContext,
} from "../../src/utils/observability/request-context.js";
import { McpError } from "../../src/utils/mcp-errors.js";
import type { ConfirmationAuditScope } from "../../src/governance/audit.js";

const ENV_KEY = "MCP_ELICIT_DESTRUCTIVE";
let savedEnv: string | undefined;

beforeEach(() => {
  savedEnv = process.env[ENV_KEY];
  delete process.env[ENV_KEY];
});
afterEach(() => {
  if (savedEnv === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = savedEnv;
});

function answering(action: "accept" | "decline", confirm = true) {
  const calls: Array<Record<string, any>> = [];
  const ctx: ElicitContext = {
    elicitInput: async (opts) => {
      calls.push(opts);
      return action === "accept" ? { action, content: { confirm } } : { action };
    },
  };
  return { ctx, calls };
}

/** Runs `fn` inside a factory-like audit scope and returns the audit records it wrote. */
async function withAudit<T>(
  scope: Partial<ConfirmationAuditScope>,
  fn: () => Promise<T>
): Promise<{ value: T; records: Array<Record<string, any>> }> {
  const lines: Array<Record<string, any>> = [];
  const logger = pino({ level: "info" }, { write: (s: string) => void lines.push(JSON.parse(s)) });
  const ctx = createRequestContext("test");
  ctx.confirmationAudit = {
    logger,
    toolName: "x_tool",
    argsDigest: "d".repeat(64),
    principalTag: "p",
    ...scope,
  } as ConfirmationAuditScope;
  const value = await runWithRequestContext(ctx, fn);
  return { value, records: lines.filter((l) => l.event === "destructive_confirmation") };
}

const ARCHIVED = new Set(["ARCHIVED"]);

describe("terminalStatusValuesFor reads registry.json", () => {
  it("returns the platform's values, upper-cased, for a declared tool", () => {
    expect([...terminalStatusValuesFor("dv360_update_entity")]).toEqual(["ENTITY_STATUS_ARCHIVED"]);
    expect([...terminalStatusValuesFor("ttd_bulk_update_status")]).toEqual(["ARCHIVED"]);
    expect([...terminalStatusValuesFor("meta_update_entity")].sort()).toEqual([
      "ARCHIVED",
      "DELETED",
    ]);
  });

  it("throws for a tool that registry.json does not declare terminal", () => {
    expect(() => terminalStatusValuesFor("snapchat_update_entity")).toThrow(/not declared/);
    expect(() => terminalStatusValuesFor("nope_update_entity")).toThrow(/not declared/);
  });

  it("every server that declares a status-dependent terminal tool declares its values", () => {
    // A note saying "Terminal only for that value" is a status-dependent entry.
    for (const server of REGISTRY_DATA.servers) {
      const statusDependent = server.operational.terminalOperations.filter((t) =>
        /terminal only (for|when)/i.test(t.note)
      );
      if (statusDependent.length === 0) continue;
      expect(server.operational.terminalStatusValues.length, server.package).toBeGreaterThan(0);
    }
  });

  it("matches case-insensitively", () => {
    const ttd = terminalStatusValuesFor("ttd_update_entity");
    expect(isTerminalStatusValue(ttd, "Archived")).toBe(true);
    expect(isTerminalStatusValue(ttd, "ARCHIVED")).toBe(true);
    expect(isTerminalStatusValue(ttd, "Paused")).toBe(false);
    expect(isTerminalStatusValue(ttd, undefined)).toBe(false);
  });
});

describe("findTerminalStatusValues", () => {
  it("finds a terminal value on any status-like key, nested", () => {
    expect(
      findTerminalStatusValues(
        { name: "x", status: "ARCHIVED", child: { intendedStatus: "archived" } },
        ARCHIVED
      )
    ).toEqual([
      { path: "status", value: "ARCHIVED" },
      { path: "child.intendedStatus", value: "archived" },
    ]);
  });

  it("ignores the value on a non-status key and an ordinary status", () => {
    expect(findTerminalStatusValues({ name: "ARCHIVED", status: "PAUSED" }, ARCHIVED)).toEqual([]);
  });

  it("restrictToUpdateMask drops what the mask does not write", () => {
    const data = { entityStatus: "ENTITY_STATUS_ARCHIVED", displayName: "n", budget: { a: 1 } };
    expect(restrictToUpdateMask(data, "displayName,budget.a")).toEqual({
      displayName: "n",
      budget: { a: 1 },
    });
    expect(restrictToUpdateMask(data, undefined)).toBe(data);
  });
});

describe("elicitBulkStatusChangeConfirmation: irreversible input", () => {
  it("a terminal target with no channel is refused", async () => {
    const { value, records } = await withAudit({}, () =>
      elicitBulkStatusChangeConfirmation({
        count: 3,
        entityLabel: "lineItem",
        targetStatus: "ENTITY_STATUS_ARCHIVED",
        irreversible: true,
      })
    );
    expect(value).toBe(false);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ outcome: "refused_no_channel", irreversible: true });
  });

  it("a reversible target with no channel still goes ahead", async () => {
    const { value, records } = await withAudit({}, () =>
      elicitBulkStatusChangeConfirmation({
        count: 3,
        entityLabel: "lineItem",
        targetStatus: "ENTITY_STATUS_PAUSED",
        irreversible: false,
      })
    );
    expect(value).toBe(true);
    expect(records[0]).toMatchObject({ outcome: "allowed_no_channel", irreversible: false });
  });

  it("says the target is terminal in the prompt", async () => {
    const { ctx, calls } = answering("accept");
    expect(
      await elicitBulkStatusChangeConfirmation({
        count: 2,
        entityLabel: "campaign",
        targetStatus: "REMOVED",
        irreversible: true,
        sdkContext: ctx,
      })
    ).toBe(true);
    expect(calls[0]!.message).toContain("status='REMOVED' is terminal");
  });

  it("a verified governance approval skips the question (B6)", async () => {
    const { ctx, calls } = answering("decline");
    const { value, records } = await withAudit({ jti: "j-1", approvalId: "ap-1" }, () =>
      elicitBulkStatusChangeConfirmation({
        count: 2,
        entityLabel: "campaign",
        targetStatus: "REMOVED",
        irreversible: true,
        sdkContext: ctx,
      })
    );
    expect(value).toBe(true);
    expect(calls).toHaveLength(0);
    expect(records[0]).toMatchObject({ outcome: "approved_by_governance", approvalId: "ap-1" });
  });
});

describe("elicitTerminalTransitionConfirmation", () => {
  const terminalItems = [{ id: "123", transitions: ["status=ARCHIVED"] }];

  it("is irreversible: refused with no channel", async () => {
    const { value, records } = await withAudit({}, () =>
      elicitTerminalTransitionConfirmation({ count: 1, entityLabel: "ad", terminalItems })
    );
    expect(value).toBe(false);
    expect(records[0]).toMatchObject({ outcome: "refused_no_channel", irreversible: true });
  });

  it("accepted: true; declined: false; one record each", async () => {
    const yes = answering("accept");
    const accepted = await withAudit({}, () =>
      elicitTerminalTransitionConfirmation({
        count: 1,
        entityLabel: "ad",
        terminalItems,
        sdkContext: yes.ctx,
      })
    );
    expect(accepted.value).toBe(true);
    expect(accepted.records.map((r) => r.outcome)).toEqual(["accepted"]);
    expect(yes.calls[0]!.message).toContain("irreversible change to ad 123: status=ARCHIVED");

    const no = answering("decline");
    const declined = await withAudit({}, () =>
      elicitTerminalTransitionConfirmation({
        count: 1,
        entityLabel: "ad",
        terminalItems,
        sdkContext: no.ctx,
      })
    );
    expect(declined.value).toBe(false);
    expect(declined.records.map((r) => r.outcome)).toEqual(["declined"]);
  });

  it("a batch lists the terminal items, not the rest", async () => {
    const { ctx, calls } = answering("accept");
    await elicitTerminalTransitionConfirmation({
      count: 3,
      entityLabel: "ad",
      terminalItems: [
        { id: "1", transitions: ["status=ARCHIVED"] },
        { id: "3", transitions: ["status=ARCHIVED"] },
      ],
      sdkContext: ctx,
    });
    expect(calls).toHaveLength(1);
    const message = calls[0]!.message as string;
    expect(message).toContain("2 of 3 ad(s)");
    expect(message).toContain("• 1: status=ARCHIVED");
    expect(message).toContain("• 3: status=ARCHIVED");
  });

  it("MCP_ELICIT_DESTRUCTIVE=skip allows it unasked", async () => {
    process.env[ENV_KEY] = "skip";
    const { value, records } = await withAudit({}, () =>
      elicitTerminalTransitionConfirmation({ count: 1, entityLabel: "ad", terminalItems })
    );
    expect(value).toBe(true);
    expect(records[0]).toMatchObject({ outcome: "skipped_by_env" });
  });

  it("a verified governance approval skips it (B6); a token without approvalId does not", async () => {
    const approved = await withAudit({ jti: "j", approvalId: "a" }, () =>
      elicitTerminalTransitionConfirmation({ count: 1, entityLabel: "ad", terminalItems })
    );
    expect(approved.value).toBe(true);
    expect(approved.records[0]).toMatchObject({ outcome: "approved_by_governance" });

    const machine = await withAudit({ jti: "j" }, () =>
      elicitTerminalTransitionConfirmation({ count: 1, entityLabel: "ad", terminalItems })
    );
    expect(machine.value).toBe(false);
    expect(machine.records[0]).toMatchObject({ outcome: "refused_no_channel" });
  });
});

describe("assertTerminalTransitionsConfirmed", () => {
  it("asks nothing when no item is terminal", async () => {
    const { ctx, calls } = answering("decline");
    await expect(
      assertTerminalTransitionsConfirmed({
        count: 2,
        entityLabel: "ad",
        terminalItems: findTerminalTransitions(ARCHIVED, [
          { id: "1", payload: { status: "PAUSED" } },
          { id: "2", payload: { name: "ARCHIVED" } },
        ]),
        sdkContext: ctx,
      })
    ).resolves.toBeUndefined();
    expect(calls).toHaveLength(0);
  });

  it("throws, writing nothing, when declined or when there is no channel", async () => {
    const terminalItems = findTerminalTransitions(ARCHIVED, [
      { id: "1", payload: { status: "ARCHIVED" } },
    ]);
    const { ctx } = answering("decline");
    await expect(
      assertTerminalTransitionsConfirmed({
        count: 1,
        entityLabel: "ad",
        terminalItems,
        sdkContext: ctx,
      })
    ).rejects.toBeInstanceOf(McpError);
    await expect(
      assertTerminalTransitionsConfirmed({ count: 1, entityLabel: "ad", terminalItems })
    ).rejects.toThrow(/Not applied/);
  });

  it("resolves once accepted", async () => {
    const { ctx, calls } = answering("accept");
    await assertTerminalTransitionsConfirmed({
      count: 1,
      entityLabel: "ad",
      terminalItems: [{ id: "1", transitions: ["status=ARCHIVED"] }],
      sdkContext: ctx,
    });
    expect(calls).toHaveLength(1);
  });
});

describe("elicitBulkMutationConfirmation with terminal items", () => {
  it("asks once, as irreversible, even below the count threshold", async () => {
    const { value, records } = await withAudit({}, () =>
      elicitBulkMutationConfirmation({
        count: 2,
        entityLabel: "ad",
        summary: "names",
        hasSensitiveFieldChange: false,
        terminalItems: [{ id: "1", transitions: ["status=ARCHIVED"] }],
      })
    );
    expect(value).toBe(false);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ outcome: "refused_no_channel", irreversible: true });
  });

  it("without terminal items keeps the threshold skip", async () => {
    const { ctx, calls } = answering("decline");
    expect(
      await elicitBulkMutationConfirmation({
        count: 2,
        entityLabel: "ad",
        summary: "names",
        terminalItems: [],
        sdkContext: ctx,
      })
    ).toBe(true);
    expect(calls).toHaveLength(0);
  });
});

describe("elicitIrreversibleOperationConfirmation", () => {
  it("is refused with no channel and asks with one", async () => {
    const opts = {
      action: "Run a mutation.",
      consequence: "It may delete things.",
      confirmTitle: "Confirm",
      confirmDescription: "Run it",
    };
    expect(await elicitIrreversibleOperationConfirmation(opts)).toBe(false);
    const { ctx, calls } = answering("accept");
    expect(await elicitIrreversibleOperationConfirmation({ ...opts, sdkContext: ctx })).toBe(true);
    expect(calls).toHaveLength(1);
  });
});

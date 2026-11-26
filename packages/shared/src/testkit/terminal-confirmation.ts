// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import pino from "pino";
import {
  createRequestContext,
  runWithRequestContext,
} from "../utils/observability/request-context.js";

/**
 * One tool that can make an irreversible change, driven through its real
 * `*Logic` with only `fetch` stubbed (the package's wire kit).
 */
export interface TerminalConfirmationCase {
  /** The advertised tool name, for the test titles and the audit scope. */
  tool: string;
  /** Calls the tool's `*Logic` with the given sdkContext. */
  run: (input: unknown, sdkContext: Record<string, unknown>) => Promise<unknown>;
  /** An input whose effect is irreversible: a terminal status, a delete, a mutation. */
  terminal: unknown;
  /** Routes this case needs (pre-reads), added after `setup` on every test. */
  routes?: () => void;
  /**
   * An input of the same tool that changes nothing irreversibly. It must not be
   * refused without a channel, and (unless `ordinaryAsks`) must not prompt.
   */
  ordinary?: unknown;
  /** The ordinary input still asks its reversible question (a bulk status change). */
  ordinaryAsks?: boolean;
}

export interface TerminalConfirmationOptions {
  /** Installs the fetch stub and a wire session; returns how to read writes. */
  setup: () => Promise<TerminalConfirmationFixture> | TerminalConfirmationFixture;
  cases: TerminalConfirmationCase[];
}

export interface TerminalConfirmationFixture {
  sessionId: string;
  /** Upstream requests that change something (the package decides what is a read). */
  writes: () => unknown[];
  dispose: () => void;
}

const ACCEPT = { action: "accept", content: { confirm: true } };

/** Runs a call that may end in a refusal, a decline error or a response the stub cannot shape. */
async function settle(run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (e) {
    if (process.env.DEBUG_TERMINAL) console.error("settle", e);
    // The assertions are on what was sent upstream, not on the result shape.
  }
}

/**
 * The fleet-wide confirmation contract for an irreversible operation, per tool:
 *
 * - no elicitation channel: refused, nothing written;
 * - declined: asked once, nothing written;
 * - accepted: asked exactly once (a batch too), then written;
 * - a verified decision token with an `approvalId` (B6): written, not asked;
 * - an ordinary input of the same tool: not refused, and not asked.
 *
 * "Nothing written" is asserted on the wire: the package's `writes()` sees
 * every non-read request that reached the stubbed `fetch`.
 */
export function describeTerminalConfirmation(options: TerminalConfirmationOptions): void {
  const savedEnv = process.env.MCP_ELICIT_DESTRUCTIVE;
  let fixture: TerminalConfirmationFixture;

  beforeEach(async () => {
    delete process.env.MCP_ELICIT_DESTRUCTIVE;
    fixture = await options.setup();
  });
  afterEach(() => {
    fixture.dispose();
    if (savedEnv === undefined) delete process.env.MCP_ELICIT_DESTRUCTIVE;
    else process.env.MCP_ELICIT_DESTRUCTIVE = savedEnv;
  });

  for (const c of options.cases) {
    describe(`${c.tool}: irreversible change is confirmed before the first write`, () => {
      beforeEach(() => c.routes?.());

      it("with no elicitation channel it is refused and nothing is written", async () => {
        await settle(() => c.run(c.terminal, { sessionId: fixture.sessionId }));
        expect(fixture.writes()).toEqual([]);
      });

      it("declined: asked once, nothing is written", async () => {
        const elicitInput = vi.fn().mockResolvedValue({ action: "decline" });
        await settle(() => c.run(c.terminal, { sessionId: fixture.sessionId, elicitInput }));
        expect(elicitInput).toHaveBeenCalledTimes(1);
        expect(fixture.writes()).toEqual([]);
      });

      it("accepted: asked exactly once, then written", async () => {
        const elicitInput = vi.fn().mockResolvedValue(ACCEPT);
        await settle(() => c.run(c.terminal, { sessionId: fixture.sessionId, elicitInput }));
        expect(elicitInput).toHaveBeenCalledTimes(1);
        expect(fixture.writes().length).toBeGreaterThan(0);
      });

      it("a verified governance approval (B6) is the confirmation: written, not asked", async () => {
        const ctx = createRequestContext("test");
        ctx.confirmationAudit = {
          logger: pino({ level: "silent" }),
          toolName: c.tool,
          argsDigest: "0".repeat(64),
          principalTag: "principal",
          jti: "jti-approved",
          approvalId: "approval-1",
        };
        await settle(() =>
          runWithRequestContext(ctx, () => c.run(c.terminal, { sessionId: fixture.sessionId }))
        );
        expect(fixture.writes().length).toBeGreaterThan(0);
      });

      if (c.ordinary !== undefined) {
        it(
          c.ordinaryAsks
            ? "an ordinary input is not refused without a channel"
            : "an ordinary input is not asked and not refused",
          async () => {
            const elicitInput = vi.fn().mockResolvedValue({ action: "decline" });
            if (!c.ordinaryAsks) {
              await settle(() => c.run(c.ordinary, { sessionId: fixture.sessionId, elicitInput }));
              expect(elicitInput).not.toHaveBeenCalled();
              expect(fixture.writes().length).toBeGreaterThan(0);
            } else {
              await settle(() => c.run(c.ordinary, { sessionId: fixture.sessionId }));
              expect(fixture.writes().length).toBeGreaterThan(0);
            }
          }
        );
      }
    });
  }
}

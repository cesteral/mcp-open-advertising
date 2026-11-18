// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * #244 follow-up: `dv360_adjust_line_item_bids` under Multi Round-Trip Requests.
 *
 * A question ends the call with `input_required` and the handler re-runs from the
 * top on the retry. So (a) every missing id is asked before the first PATCH,
 * (b) the question is never swallowed by the per-item try/catch, and (c) two
 * items missing the same field ask different questions (an answer is keyed by
 * the exact prompt text).
 *
 * Uses the real `ensureRequiredFieldValue`; only the session services and the
 * round driver (`elicitInput`) are faked.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { RateLimiter, ConfirmationRequired } from "@cesteral/shared";

const { mockResolveSessionServices } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
}));

vi.mock("../../../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

import { adjustLineItemBidsLogic } from "../../../../src/mcp-server/tools/definitions/adjust-line-item-bids.tool.js";

const context = { requestId: "r", timestamp: new Date().toISOString(), operation: "t" } as any;

/** Answers by prompt text; an unanswered prompt throws, as the factory's `elicitInput` does. */
function round(answers: Record<string, { action: string; content?: Record<string, unknown> }>) {
  const asked: string[] = [];
  const elicitInput = vi.fn(async (params: { message: string }) => {
    asked.push(params.message);
    const answer =
      answers[params.message] ??
      (params.message.includes("adjust bids")
        ? { action: "accept", content: { confirm: true } }
        : undefined);
    if (!answer) throw new ConfirmationRequired(`k${asked.length}`, params as any);
    return answer;
  });
  return { asked, sdkContext: { sessionId: "s", elicitInput } as any };
}

const promptFor = (field: string, n: number, total: number) =>
  `Provide the ${field} to continue batch bid adjustment ${n} of ${total}.`;

describe("dv360_adjust_line_item_bids: handler re-run", () => {
  let service: { getEntity: any; updateEntity: any; bulkCapacityChecks: any };

  beforeEach(() => {
    service = {
      bulkCapacityChecks: (tool: string, ids: unknown[], cost: number[]) => [
        {
          rateLimiter: new RateLimiter(),
          toolName: tool,
          itemCount: ids.length,
          buckets: [{ key: "dv360:t", costPerItem: cost }],
        },
      ],
      getEntity: vi.fn().mockResolvedValue({
        displayName: "LI",
        bidStrategy: { fixedBid: { bidAmountMicros: "1000000" } },
      }),
      updateEntity: vi.fn().mockResolvedValue({}),
    };
    mockResolveSessionServices.mockReturnValue({ dv360Service: service });
  });

  const input = {
    adjustments: [
      { advertiserId: "a1", lineItemId: "l1", newBidMicros: 2_000_000 },
      { advertiserId: "a2", newBidMicros: 3_000_000 }, // lineItemId missing
    ],
  } as any;

  it("asks for a missing id before writing item 1, and the question is not an item failure", async () => {
    const r = round({});
    await expect(adjustLineItemBidsLogic(input, context, r.sdkContext)).rejects.toBeInstanceOf(
      ConfirmationRequired
    );
    expect(service.getEntity).not.toHaveBeenCalled();
    expect(service.updateEntity).not.toHaveBeenCalled();
  });

  it("asks one distinct question per item, and an answer fills only its own item", async () => {
    const two = {
      adjustments: [
        { advertiserId: "a1", newBidMicros: 2_000_000 },
        { advertiserId: "a1", newBidMicros: 3_000_000 },
      ],
    } as any;
    const r = round({
      [promptFor("Line Item ID", 1, 2)]: { action: "accept", content: { lineItemId: "L-first" } },
      [promptFor("Line Item ID", 2, 2)]: { action: "accept", content: { lineItemId: "L-second" } },
    });
    const result = await adjustLineItemBidsLogic(two, context, r.sdkContext);
    expect(result.totalSuccessful).toBe(2);
    expect(service.updateEntity.mock.calls.map((c: any[]) => c[1].lineItemId)).toEqual([
      "L-first",
      "L-second",
    ]);
  });

  it("re-running with the earlier answers asks only the next question, and still writes nothing until all are in", async () => {
    const answers: Record<string, any> = {};
    const three = {
      adjustments: [
        { advertiserId: "a1", newBidMicros: 2_000_000 },
        { advertiserId: "a1", newBidMicros: 3_000_000 },
      ],
    } as any;
    // Round 1: nothing answered -> asks about item 1.
    let r = round(answers);
    await expect(adjustLineItemBidsLogic(three, context, r.sdkContext)).rejects.toBeInstanceOf(
      ConfirmationRequired
    );
    expect(r.asked.at(-1)).toBe(promptFor("Line Item ID", 1, 2));
    // Round 2: item 1 answered -> asks about item 2; still nothing written.
    answers[promptFor("Line Item ID", 1, 2)] = { action: "accept", content: { lineItemId: "L1" } };
    r = round(answers);
    await expect(adjustLineItemBidsLogic(three, context, r.sdkContext)).rejects.toBeInstanceOf(
      ConfirmationRequired
    );
    expect(r.asked.at(-1)).toBe(promptFor("Line Item ID", 2, 2));
    expect(service.updateEntity).not.toHaveBeenCalled();
    // Round 3: all answered -> writes each exactly once.
    answers[promptFor("Line Item ID", 2, 2)] = { action: "accept", content: { lineItemId: "L2" } };
    r = round(answers);
    const result = await adjustLineItemBidsLogic(three, context, r.sdkContext);
    expect(result.totalSuccessful).toBe(2);
    expect(service.updateEntity).toHaveBeenCalledTimes(2);
  });

  it("a declined id answer fails that item only", async () => {
    const r = round({ [promptFor("Line Item ID", 2, 2)]: { action: "decline" } });
    const result = await adjustLineItemBidsLogic(input, context, r.sdkContext);
    expect(result.totalSuccessful).toBe(1);
    expect(result.totalFailed).toBe(1);
    expect(result.failed[0].error).toContain("Unable to continue");
    expect(service.updateEntity).toHaveBeenCalledTimes(1);
  });
});

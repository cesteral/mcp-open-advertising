// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  __resetElicitModeCache,
  elicitArchiveConfirmation,
  elicitBidChangeConfirmation,
  elicitBudgetChangeConfirmation,
  elicitBulkDeleteConfirmation,
  elicitBulkMutationConfirmation,
  elicitBulkStatusChangeConfirmation,
  elicitConversionUploadConfirmation,
  elicitDeleteConfirmation,
  hasSensitiveBulkField,
  type ElicitContext,
} from "../../src/utils/elicitation-helpers.js";

function makeAcceptingContext(): { ctx: ElicitContext; calls: Record<string, unknown>[] } {
  const calls: Record<string, unknown>[] = [];
  return {
    calls,
    ctx: {
      elicitInput: async (opts) => {
        calls.push(opts);
        return { action: "accept", content: { confirm: true } };
      },
    },
  };
}

function makeDecliningContext(): ElicitContext {
  return {
    elicitInput: async () => ({ action: "decline" }),
  };
}

function makeAcceptedButUncheckedContext(): ElicitContext {
  return {
    elicitInput: async () => ({ action: "accept", content: { confirm: false } }),
  };
}

const ENV_KEY = "MCP_ELICIT_DESTRUCTIVE";
const originalEnv = process.env[ENV_KEY];

beforeEach(() => {
  delete process.env[ENV_KEY];
  __resetElicitModeCache();
});

afterEach(() => {
  if (originalEnv === undefined) {
    delete process.env[ENV_KEY];
  } else {
    process.env[ENV_KEY] = originalEnv;
  }
  __resetElicitModeCache();
  vi.restoreAllMocks();
});

describe("confirmDestructive (via elicitArchiveConfirmation)", () => {
  it("returns true when sdkContext has no elicitInput (stdio fallback)", async () => {
    const result = await elicitArchiveConfirmation(3, "campaign", undefined);
    expect(result).toBe(true);
  });

  it("returns true when sdkContext is provided but elicitInput is absent", async () => {
    const result = await elicitArchiveConfirmation(3, "campaign", {});
    expect(result).toBe(true);
  });

  it("returns true when user accepts and confirms", async () => {
    const { ctx } = makeAcceptingContext();
    const result = await elicitArchiveConfirmation(3, "campaign", ctx);
    expect(result).toBe(true);
  });

  it("returns false when user declines", async () => {
    const ctx = makeDecliningContext();
    const result = await elicitArchiveConfirmation(3, "campaign", ctx);
    expect(result).toBe(false);
  });

  it("returns false when user accepts the form but does not check confirm", async () => {
    const ctx = makeAcceptedButUncheckedContext();
    const result = await elicitArchiveConfirmation(3, "campaign", ctx);
    expect(result).toBe(false);
  });

  it("preserves backwards-compatible (count, entityLabel, sdkContext) signature", async () => {
    const { ctx, calls } = makeAcceptingContext();
    await elicitArchiveConfirmation(7, "ad set", ctx);
    expect(calls).toHaveLength(1);
    const message = calls[0]!.message as string;
    expect(message).toContain("7 ad set(s)");
    expect(message).toContain("irreversible");
  });
});

describe("client without elicitation support", () => {
  it("allows the operation when SDK rejects with 'does not support elicitation' (client capability missing)", async () => {
    const ctx: ElicitContext = {
      elicitInput: async () => {
        throw new Error("Client does not support elicitation (required for elicitation/create)");
      },
    };
    const result = await elicitArchiveConfirmation(3, "campaign", ctx);
    expect(result).toBe(true);
  });

  it("allows when SDK rejects with 'does not support form elicitation'", async () => {
    const ctx: ElicitContext = {
      elicitInput: async () => {
        throw new Error("Client does not support form elicitation.");
      },
    };
    const result = await elicitDeleteConfirmation({
      entityLabel: "campaign",
      entityId: "1",
      sdkContext: ctx,
    });
    expect(result).toBe(true);
  });

  it("re-throws non-unsupported errors (real transport failure must not silently allow deletion)", async () => {
    const ctx: ElicitContext = {
      elicitInput: async () => {
        throw new Error("ECONNRESET");
      },
    };
    await expect(
      elicitDeleteConfirmation({
        entityLabel: "campaign",
        entityId: "1",
        sdkContext: ctx,
      })
    ).rejects.toThrow("ECONNRESET");
  });
});

describe("MCP_ELICIT_DESTRUCTIVE env", () => {
  it("default (unset) requires elicitation — declined user gets false", async () => {
    const result = await elicitArchiveConfirmation(3, "campaign", makeDecliningContext());
    expect(result).toBe(false);
  });

  it("explicit 'require' behaves the same as unset", async () => {
    process.env[ENV_KEY] = "require";
    const result = await elicitArchiveConfirmation(3, "campaign", makeDecliningContext());
    expect(result).toBe(false);
  });

  it("'skip' bypasses elicitation entirely and returns true", async () => {
    process.env[ENV_KEY] = "skip";
    const ctx = makeDecliningContext();
    const elicitSpy = vi.spyOn(ctx, "elicitInput");
    const result = await elicitArchiveConfirmation(3, "campaign", ctx);
    expect(result).toBe(true);
    expect(elicitSpy).not.toHaveBeenCalled();
  });

  it("unknown values fall back to 'require' and emit a warning", async () => {
    process.env[ENV_KEY] = "garbage";
    const ctx = makeDecliningContext();
    const result = await elicitArchiveConfirmation(3, "campaign", ctx);
    // Falls back to require — declining user → false (proves elicitation ran).
    expect(result).toBe(false);
  });

  it("env value is read once and memoized", async () => {
    process.env[ENV_KEY] = "skip";
    expect(await elicitArchiveConfirmation(1, "ad", makeDecliningContext())).toBe(true);
    // Change env without resetting cache — should still see 'skip' until reset.
    process.env[ENV_KEY] = "require";
    expect(await elicitArchiveConfirmation(1, "ad", makeDecliningContext())).toBe(true);
    __resetElicitModeCache();
    expect(await elicitArchiveConfirmation(1, "ad", makeDecliningContext())).toBe(false);
  });
});

describe("elicitDeleteConfirmation", () => {
  it("includes entity name when provided", async () => {
    const { ctx, calls } = makeAcceptingContext();
    await elicitDeleteConfirmation({
      entityLabel: "campaign",
      entityId: "12345",
      entityName: "Holiday Sale 2025",
      sdkContext: ctx,
    });
    const message = calls[0]!.message as string;
    expect(message).toContain("12345");
    expect(message).toContain("Holiday Sale 2025");
  });

  it("works with just an ID", async () => {
    const { ctx, calls } = makeAcceptingContext();
    await elicitDeleteConfirmation({
      entityLabel: "campaign",
      entityId: "12345",
      sdkContext: ctx,
    });
    const message = calls[0]!.message as string;
    expect(message).toContain("12345");
    expect(message).not.toContain("(");
  });

  it("returns false on decline", async () => {
    const result = await elicitDeleteConfirmation({
      entityLabel: "campaign",
      entityId: "12345",
      sdkContext: makeDecliningContext(),
    });
    expect(result).toBe(false);
  });
});

describe("elicitBulkDeleteConfirmation", () => {
  it("renders count and entity label, accepts on confirm", async () => {
    const { ctx, calls } = makeAcceptingContext();
    const result = await elicitBulkDeleteConfirmation({
      count: 7,
      entityLabel: "campaign",
      sdkContext: ctx,
    });
    expect(result).toBe(true);
    expect(calls[0]!.message as string).toContain("delete 7 campaign(s)");
  });

  it("returns false on decline", async () => {
    const result = await elicitBulkDeleteConfirmation({
      count: 7,
      entityLabel: "campaign",
      sdkContext: makeDecliningContext(),
    });
    expect(result).toBe(false);
  });
});

describe("hasSensitiveBulkField", () => {
  it("returns false for empty / undefined input", () => {
    expect(hasSensitiveBulkField(undefined)).toBe(false);
    expect(hasSensitiveBulkField([])).toBe(false);
    expect(hasSensitiveBulkField([undefined, undefined])).toBe(false);
  });

  it("returns false when no payload mentions status/budget/bid keys", () => {
    expect(hasSensitiveBulkField([{ displayName: "x" }, { name: "y", description: "z" }])).toBe(
      false
    );
  });

  it.each([
    ["status"],
    ["entityStatus"],
    ["archived"],
    ["active"],
    ["budget"],
    ["dailyBudget"],
    ["daily_budget"],
    ["bid"],
    ["bidAmount"],
    ["bid_amount"],
    ["cpcBid"],
    ["cpm_price"],
    ["spendCap"],
    ["pacing_type"],
  ])("flags '%s' as sensitive", (key) => {
    expect(hasSensitiveBulkField([{ [key]: 1 }])).toBe(true);
  });

  it("returns true if any single payload contains a sensitive key", () => {
    expect(
      hasSensitiveBulkField([{ displayName: "x" }, { name: "y" }, { entityStatus: "PAUSED" }])
    ).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(hasSensitiveBulkField([{ Status: "PAUSED" }])).toBe(true);
    expect(hasSensitiveBulkField([{ BUDGET: 100 }])).toBe(true);
  });
});

describe("elicitBulkStatusChangeConfirmation", () => {
  it("does not apply a count threshold — always elicits", async () => {
    const { ctx, calls } = makeAcceptingContext();
    await elicitBulkStatusChangeConfirmation({
      count: 1,
      entityLabel: "campaign",
      targetStatus: "PAUSED",
      sdkContext: ctx,
    });
    expect(calls).toHaveLength(1);
  });

  it("renders the target status into the prompt", async () => {
    const { ctx, calls } = makeAcceptingContext();
    await elicitBulkStatusChangeConfirmation({
      count: 5,
      entityLabel: "ad group",
      targetStatus: "ARCHIVED",
      sdkContext: ctx,
    });
    const message = calls[0]!.message as string;
    expect(message).toContain("status='ARCHIVED'");
    expect(message).toContain("5 ad group(s)");
  });
});

describe("elicitBulkMutationConfirmation", () => {
  it("skips elicitation when count < threshold and no sensitive field change", async () => {
    const { ctx, calls } = makeAcceptingContext();
    const result = await elicitBulkMutationConfirmation({
      count: 5,
      entityLabel: "campaign",
      summary: "Updating display names.",
      hasSensitiveFieldChange: false,
      sdkContext: ctx,
    });
    expect(result).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it("elicits when count >= 10 even without sensitive fields", async () => {
    const { ctx, calls } = makeAcceptingContext();
    await elicitBulkMutationConfirmation({
      count: 10,
      entityLabel: "campaign",
      summary: "Updating display names.",
      hasSensitiveFieldChange: false,
      sdkContext: ctx,
    });
    expect(calls).toHaveLength(1);
  });

  it("elicits below threshold when sensitive field change is flagged", async () => {
    const { ctx, calls } = makeAcceptingContext();
    await elicitBulkMutationConfirmation({
      count: 2,
      entityLabel: "campaign",
      summary: "Adjusting daily budget.",
      hasSensitiveFieldChange: true,
      sdkContext: ctx,
    });
    expect(calls).toHaveLength(1);
  });

  it("respects a custom threshold override", async () => {
    const { ctx, calls } = makeAcceptingContext();
    await elicitBulkMutationConfirmation({
      count: 3,
      entityLabel: "campaign",
      summary: "Updating names.",
      threshold: 3,
      sdkContext: ctx,
    });
    expect(calls).toHaveLength(1);
  });
});

describe("impact preview", () => {
  it("renders up to 5 rows and an overflow line", async () => {
    const { ctx, calls } = makeAcceptingContext();
    await elicitBulkStatusChangeConfirmation({
      count: 8,
      entityLabel: "campaign",
      targetStatus: "PAUSED",
      impactPreview: ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"],
      sdkContext: ctx,
    });
    const message = calls[0]!.message as string;
    expect(message).toContain("• c1");
    expect(message).toContain("• c5");
    expect(message).not.toContain("• c6");
    expect(message).toContain("and 3 more");
  });

  it("renders all rows when below the cap with no overflow line", async () => {
    const { ctx, calls } = makeAcceptingContext();
    await elicitBulkStatusChangeConfirmation({
      count: 2,
      entityLabel: "campaign",
      targetStatus: "PAUSED",
      impactPreview: ["c1", "c2"],
      sdkContext: ctx,
    });
    const message = calls[0]!.message as string;
    expect(message).toContain("• c1");
    expect(message).toContain("• c2");
    expect(message).not.toContain("more");
  });
});

describe("other named helpers", () => {
  it("elicitBidChangeConfirmation accepts and declines", async () => {
    expect(
      await elicitBidChangeConfirmation({
        count: 4,
        entityLabel: "ad group",
        summary: "Increasing bids by 10%.",
        sdkContext: makeAcceptingContext().ctx,
      })
    ).toBe(true);
    expect(
      await elicitBidChangeConfirmation({
        count: 4,
        entityLabel: "ad group",
        summary: "Increasing bids by 10%.",
        sdkContext: makeDecliningContext(),
      })
    ).toBe(false);
  });

  it("elicitBudgetChangeConfirmation references the entity in its prompt", async () => {
    const { ctx, calls } = makeAcceptingContext();
    await elicitBudgetChangeConfirmation({
      entityLabel: "campaign",
      entityId: "777",
      summary: "Raising daily budget from $50 to $200.",
      sdkContext: ctx,
    });
    const message = calls[0]!.message as string;
    expect(message).toContain("campaign 777");
    expect(message).toContain("$50 to $200");
  });

  it("elicitConversionUploadConfirmation distinguishes insert vs update", async () => {
    const { ctx, calls } = makeAcceptingContext();
    await elicitConversionUploadConfirmation({ count: 50, operation: "insert", sdkContext: ctx });
    await elicitConversionUploadConfirmation({ count: 50, operation: "update", sdkContext: ctx });
    const insertMsg = calls[0]!.message as string;
    const updateMsg = calls[1]!.message as string;
    expect(insertMsg).toContain("insert 50");
    expect(updateMsg).toContain("update 50");
  });
});

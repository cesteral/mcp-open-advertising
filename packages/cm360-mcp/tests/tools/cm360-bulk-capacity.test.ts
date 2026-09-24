// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Bulk capacity pre-check for the CM360 bulk tools.
 *
 * Runs the REAL tool logic against a REAL CM360Service wired to the package's
 * REAL default limiter (`cm360:*`, 5/min, 120s queue budget) — only the HTTP
 * client and the confirmation prompts are faked. A batch that cannot clear the
 * limit within budget must be refused with `RateLimited` before any prompt and
 * before any upstream call; the dry-run must predict the refusal.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockResolveSessionServices, mockElicitStatus, mockElicitMutation } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
  mockElicitStatus: vi.fn(),
  mockElicitMutation: vi.fn(),
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return {
    ...actual,
    elicitBulkStatusChangeConfirmation: mockElicitStatus,
    elicitBulkMutationConfirmation: mockElicitMutation,
  };
});

import { McpError, JsonRpcErrorCode } from "@cesteral/shared";
import { rateLimiter } from "../../src/utils/platform.js";
import { CM360Service } from "../../src/services/cm360/cm360-service.js";
import { bulkUpdateStatusLogic } from "../../src/mcp-server/tools/definitions/bulk-update-status.tool.js";
import { bulkUpdateEntitiesLogic } from "../../src/mcp-server/tools/definitions/bulk-update-entities.tool.js";
import { bulkCreateEntitiesLogic } from "../../src/mcp-server/tools/definitions/bulk-create-entities.tool.js";

const ctx = { requestId: "r" } as any;
const sdk = { sessionId: "s" } as any;
const PROFILE = "123456";

const logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as any;

let fetchMock: ReturnType<typeof vi.fn>;

function ids(n: number): string[] {
  return Array.from({ length: n }, (_, i) => String(1000 + i));
}

async function expectRefused(promise: Promise<unknown>, itemCount: number, itemsThatFit: number) {
  const err = await promise.then(
    () => {
      throw new Error("expected the batch to be refused");
    },
    (e: unknown) => e
  );
  expect(err).toBeInstanceOf(McpError);
  expect((err as McpError).code).toBe(JsonRpcErrorCode.RateLimited);
  expect((err as McpError).data).toMatchObject({
    reason: "bulk_exceeds_capacity",
    itemCount,
    itemsThatFit,
  });
  expect(fetchMock).not.toHaveBeenCalled();
  expect(mockElicitStatus).not.toHaveBeenCalled();
  expect(mockElicitMutation).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-24T12:00:00Z"));
  rateLimiter.clear();
  vi.clearAllMocks();
  fetchMock = vi.fn(async () => ({ id: "1", name: "entity" }));
  const service = new CM360Service(logger, rateLimiter, { fetch: fetchMock } as any);
  mockResolveSessionServices.mockReturnValue({ cm360Service: service });
  mockElicitStatus.mockResolvedValue(true);
  mockElicitMutation.mockResolvedValue(true);
});

afterEach(() => {
  rateLimiter.clear();
  vi.useRealTimers();
});

describe("cm360 default limiter", () => {
  it("is the 5/min, 120s-budget config the capacity numbers below assume", () => {
    expect(rateLimiter.describeLimits()).toEqual([
      { pattern: "cm360:*", limit: 5, windowMs: 60_000, maxWaitMs: 120_000 },
    ]);
  });
});

describe("cm360_bulk_update_status (GET + PUT per entity)", () => {
  const input = (n: number, dry_run = false) => ({
    profileId: PROFILE,
    entityType: "campaign" as const,
    entityIds: ids(n),
    status: "ARCHIVED",
    dry_run,
  });

  it("refuses 8 entities (16 tokens > 15 admitted in 120s) with no prompt and no HTTP", async () => {
    await expectRefused(bulkUpdateStatusLogic(input(8) as any, ctx, sdk), 8, 7);
  });

  it("runs 7 entities (14 tokens) to completion", async () => {
    const pending = bulkUpdateStatusLogic(input(7) as any, ctx, sdk);
    await vi.advanceTimersByTimeAsync(120_000);
    const result = await pending;
    expect(mockElicitStatus).toHaveBeenCalledTimes(1);
    expect(result.updated).toBe(7);
    expect(fetchMock).toHaveBeenCalledTimes(14);
  });

  it("counts capacity already used on the profile, and only that profile", async () => {
    await rateLimiter.consume(`cm360:${PROFILE}`, 5);
    await expectRefused(bulkUpdateStatusLogic(input(6) as any, ctx, sdk), 6, 5);

    const other = bulkUpdateStatusLogic({ ...input(6), profileId: "999" } as any, ctx, sdk);
    await vi.advanceTimersByTimeAsync(120_000);
    expect((await other).updated).toBe(6);
  });

  it("dry-run predicts the refusal as BULK_EXCEEDS_CAPACITY, and passes a batch that fits", async () => {
    const refused = await bulkUpdateStatusLogic(input(8, true) as any, ctx, sdk);
    expect(refused.dryRun?.wouldSucceed).toBe(false);
    expect(refused.dryRun?.validationErrors).toEqual([
      expect.objectContaining({ code: "BULK_EXCEEDS_CAPACITY", field: "entityIds" }),
    ]);
    expect(refused.dryRun?.validationErrors[0]?.message).toContain("7 item(s) fit");

    const fits = await bulkUpdateStatusLogic(input(7, true) as any, ctx, sdk);
    expect(fits.dryRun?.wouldSucceed).toBe(true);
    expect(fits.dryRun?.validationErrors).toEqual([]);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockElicitStatus).not.toHaveBeenCalled();
    // The projection reserved nothing.
    expect(rateLimiter.getRemainingTokens(`cm360:${PROFILE}`)).toBe(5);
  });
});

describe("cm360_bulk_update_entities (one PATCH per item)", () => {
  const input = (n: number, dry_run = false) => ({
    profileId: PROFILE,
    entityType: "campaign" as const,
    items: ids(n).map((entityId) => ({ entityId, data: { name: `n-${entityId}` } })),
    dry_run,
  });

  it("refuses 16 items with no prompt and no HTTP", async () => {
    await expectRefused(bulkUpdateEntitiesLogic(input(16) as any, ctx, sdk), 16, 15);
  });

  it("runs 15 items to completion", async () => {
    const pending = bulkUpdateEntitiesLogic(input(15) as any, ctx, sdk);
    await vi.advanceTimersByTimeAsync(120_000);
    const result = await pending;
    expect(mockElicitMutation).toHaveBeenCalledTimes(1);
    expect(result.updated).toBe(15);
    expect(fetchMock).toHaveBeenCalledTimes(15);
  });

  it("dry-run predicts the refusal", async () => {
    const refused = await bulkUpdateEntitiesLogic(input(16, true) as any, ctx, sdk);
    expect(refused.dryRun?.wouldSucceed).toBe(false);
    expect(refused.dryRun?.validationErrors).toEqual([
      expect.objectContaining({ code: "BULK_EXCEEDS_CAPACITY", field: "items" }),
    ]);
    const fits = await bulkUpdateEntitiesLogic(input(15, true) as any, ctx, sdk);
    expect(fits.dryRun?.wouldSucceed).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("cm360_bulk_create_entities (one POST per item)", () => {
  const input = (n: number, dry_run = false) => ({
    profileId: PROFILE,
    entityType: "campaign" as const,
    items: ids(n).map((id) => ({ name: `c-${id}` })),
    dry_run,
  });

  it("refuses 16 items with no HTTP", async () => {
    await expectRefused(bulkCreateEntitiesLogic(input(16) as any, ctx, sdk), 16, 15);
  });

  it("runs 15 items to completion", async () => {
    const pending = bulkCreateEntitiesLogic(input(15) as any, ctx, sdk);
    await vi.advanceTimersByTimeAsync(120_000);
    const result = await pending;
    expect(result.created).toBe(15);
    expect(fetchMock).toHaveBeenCalledTimes(15);
  });

  it("dry-run predicts the refusal", async () => {
    const refused = await bulkCreateEntitiesLogic(input(16, true) as any, ctx, sdk);
    expect(refused.dryRun?.wouldSucceed).toBe(false);
    expect(refused.dryRun?.validationErrors).toEqual([
      expect.objectContaining({ code: "BULK_EXCEEDS_CAPACITY", field: "items" }),
    ]);
    const fits = await bulkCreateEntitiesLogic(input(15, true) as any, ctx, sdk);
    expect(fits.dryRun?.wouldSucceed).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

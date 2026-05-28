// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NormalizedEntitySnapshotSchema } from "@cesteral/shared";

vi.mock("../../src/services/session-services.js", () => ({
  sessionServiceStore: {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    getAuthContext: vi.fn(),
  },
}));

vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return {
    ...actual,
    resolveSessionServicesFromStore: vi.fn(),
  };
});

import { resolveSessionServicesFromStore } from "@cesteral/shared";
const mockResolveSession = vi.mocked(resolveSessionServicesFromStore);

import { updateCommitmentLogic } from "../../src/mcp-server/tools/definitions/update-commitment.tool.js";

const mockGetCommitment = vi.fn();
const mockUpdateCommitment = vi.fn();

beforeEach(() => {
  mockGetCommitment.mockReset();
  mockUpdateCommitment.mockReset();
  mockResolveSession.mockReturnValue({
    amazonDspV1Service: {
      getCommitment: mockGetCommitment,
      updateCommitment: mockUpdateCommitment,
    },
  } as never);
});

const baseContext = { requestId: "test-req" } as never;
const baseSdkContext = { sessionId: "test-session" } as never;

const currentCommitment = {
  commitmentId: "c1",
  commitmentName: "Q3 Upfront",
  committedSpend: 100,
  currencyCode: "USD",
  endDateTime: "2027-01-01T00:00:00+00:00",
  fulfillmentLevel: "LEVEL_5",
  spendCalculationMode: "CAMPAIGN",
  startDateTime: "2026-01-01T00:00:00+00:00",
};

describe("amazon_dsp_update_commitment — dry run", () => {
  it("does NOT call updateCommitment when dry_run=true, but DOES read current state", async () => {
    mockGetCommitment.mockResolvedValueOnce(currentCommitment);

    const result = await updateCommitmentLogic(
      {
        profileId: "1234567890",
        commitmentId: "c1",
        data: { committedSpend: 200 },
        dry_run: true,
      },
      baseContext,
      baseSdkContext
    );

    expect(mockGetCommitment).toHaveBeenCalledTimes(1);
    expect(mockUpdateCommitment).not.toHaveBeenCalled();
    expect(result.updated).toBe(false);
    expect(result.dispatchedCapability).toEqual({
      operation: "update",
      canonicalEntityKind: "commitment",
    });
    expect(result.dryRun).toBeDefined();
    expect(result.dryRun!.wouldSucceed).toBe(true);
    expect(result.dryRun!.validationErrors).toEqual([]);
    expect(result.dryRun!.validationSource).toBe("symbolic");
    expect(result.dryRun!.expectedStateSource).toBe("server_symbolic_apply");
    expect(result.dryRun!.expectedPostState).toBeDefined();
  });

  it("expectedPostState carries the merged commitment as a canonical snapshot (entityKind='commitment')", async () => {
    mockGetCommitment.mockResolvedValueOnce(currentCommitment);

    const result = await updateCommitmentLogic(
      {
        profileId: "1234567890",
        commitmentId: "c1",
        data: { committedSpend: 250, commitmentName: "Q3 Upfront (revised)" },
        dry_run: true,
      },
      baseContext,
      baseSdkContext
    );

    const post = result.dryRun!.expectedPostState!;
    // Must round-trip through the shared canonical schema (Phase 0 enum
    // includes "commitment").
    expect(() => NormalizedEntitySnapshotSchema.parse(post)).not.toThrow();
    expect(post.entityKind).toBe("commitment");
    expect(post.platformEntityId).toBe("c1");
    expect(post.displayName).toBe("Q3 Upfront (revised)");
    expect(post.accountId).toBe("1234567890");
    expect(post.budget?.lifetime?.amountMinor).toBe(25000); // 250 USD -> 25000 minor
    expect(post.schedule?.startAt).toBe(currentCommitment.startDateTime);
    expect(post.schedule?.endAt).toBe(currentCommitment.endDateTime);
  });

  it("symbolic validation catches a negative committedSpend without ever calling the API", async () => {
    mockGetCommitment.mockResolvedValueOnce(currentCommitment);

    const result = await updateCommitmentLogic(
      {
        profileId: "1234567890",
        commitmentId: "c1",
        data: { committedSpend: -50 },
        dry_run: true,
      },
      baseContext,
      baseSdkContext
    );

    expect(mockUpdateCommitment).not.toHaveBeenCalled();
    expect(result.dryRun!.wouldSucceed).toBe(false);
    expect(result.dryRun!.validationErrors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "INVALID_COMMITTED_SPEND",
          field: "data.committedSpend",
        }),
      ])
    );
  });

  it("symbolic validation catches endDateTime <= startDateTime when both are in the patch", async () => {
    mockGetCommitment.mockResolvedValueOnce(currentCommitment);

    const result = await updateCommitmentLogic(
      {
        profileId: "1234567890",
        commitmentId: "c1",
        data: {
          startDateTime: "2026-06-01T00:00:00+00:00",
          endDateTime: "2026-05-01T00:00:00+00:00",
        },
        dry_run: true,
      },
      baseContext,
      baseSdkContext
    );

    expect(result.dryRun!.wouldSucceed).toBe(false);
    expect(result.dryRun!.validationErrors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "INVALID_SCHEDULE" })])
    );
  });
});

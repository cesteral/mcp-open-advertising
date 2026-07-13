// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, it, expect, vi, beforeEach } from "vitest";

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

import {
  getCommitmentsLogic,
  getCommitmentsTool,
  getCommitmentsResponseFormatter,
  GetCommitmentsInputSchema,
} from "../../src/mcp-server/tools/definitions/get-commitments.tool.js";

const mockRetrieveCommitments = vi.fn();

beforeEach(() => {
  mockRetrieveCommitments.mockReset();
  mockResolveSession.mockReturnValue({
    amazonDspV1Service: { retrieveCommitments: mockRetrieveCommitments },
    boundProfileId: "1234567890",
  } as never);
});

const baseContext = { requestId: "test-req" } as never;
const baseSdkContext = { sessionId: "test-session" } as never;

const sampleCommitment = {
  commitmentId: "c1",
  commitmentName: "Q3",
  committedSpend: 100,
  currencyCode: "USD",
  endDateTime: "2027-01-01T00:00:00+00:00",
  fulfillmentLevel: "LEVEL_5",
  spendCalculationMode: "CAMPAIGN",
  startDateTime: "2026-01-01T00:00:00+00:00",
};

describe("amazon_dsp_get_commitments", () => {
  it("is a plain readOnly tool with no cesteral governance annotation (manifest-surface precedent)", () => {
    expect(getCommitmentsTool.name).toBe("amazon_dsp_get_commitments");
    expect(getCommitmentsTool.annotations.readOnlyHint).toBe(true);
    expect((getCommitmentsTool.annotations as { cesteral?: unknown }).cesteral).toBeUndefined();
  });

  it("input schema enforces commitmentIds cardinality 1..1000", () => {
    expect(
      GetCommitmentsInputSchema.safeParse({ profileId: "p1", commitmentIds: [] }).success
    ).toBe(false);
    const tooMany = Array.from({ length: 1001 }, (_, i) => `c${i}`);
    expect(
      GetCommitmentsInputSchema.safeParse({ profileId: "p1", commitmentIds: tooMany }).success
    ).toBe(false);
    expect(
      GetCommitmentsInputSchema.safeParse({ profileId: "p1", commitmentIds: ["c1"] }).success
    ).toBe(true);
  });

  it("returns the multi-status response verbatim (success[].commitment, error[].errors[])", async () => {
    const body = {
      success: [{ commitment: sampleCommitment, index: 0 }],
      // ErrorsIndex.index is locked to 0..0 in the spec — use index: 0 here.
      error: [{ errors: [{ code: "NOT_FOUND", message: "Commitment missing" }], index: 0 }],
    };
    mockRetrieveCommitments.mockResolvedValueOnce(body);

    const result = await getCommitmentsLogic(
      { profileId: "1234567890", commitmentIds: ["c1", "missing"] },
      baseContext,
      baseSdkContext
    );

    expect(mockRetrieveCommitments).toHaveBeenCalledWith(
      { commitmentIds: ["c1", "missing"] },
      baseContext
    );
    expect(result.response).toEqual(body);
    expect(result.timestamp).toBeDefined();
  });

  it("formatter prepends a <S> succeeded, <E> failed summary line", () => {
    const out = getCommitmentsResponseFormatter({
      response: {
        success: [{ commitment: sampleCommitment, index: 0 }],
        error: [{ errors: [{ code: "NOT_FOUND", message: "Missing" }], index: 0 }],
      },
      timestamp: "2026-05-28T12:00:00.000Z",
    });
    expect(out[0].text).toMatch(/^1 succeeded, 1 failed/);
  });
});

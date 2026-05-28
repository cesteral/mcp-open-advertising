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
  getCommitmentSpendLogic,
  getCommitmentSpendTool,
  getCommitmentSpendResponseFormatter,
  GetCommitmentSpendInputSchema,
} from "../../src/mcp-server/tools/definitions/get-commitment-spend.tool.js";

const mockRetrieveSpend = vi.fn();

beforeEach(() => {
  mockRetrieveSpend.mockReset();
  mockResolveSession.mockReturnValue({
    amazonDspV1Service: { retrieveCommitmentSpend: mockRetrieveSpend },
  } as never);
});

const baseContext = { requestId: "test-req" } as never;
const baseSdkContext = { sessionId: "test-session" } as never;

describe("amazon_dsp_get_commitment_spend", () => {
  it("is a plain readOnly tool with no cesteral governance annotation", () => {
    expect(getCommitmentSpendTool.name).toBe("amazon_dsp_get_commitment_spend");
    expect(getCommitmentSpendTool.annotations.readOnlyHint).toBe(true);
    expect(
      (getCommitmentSpendTool.annotations as { cesteral?: unknown }).cesteral,
    ).toBeUndefined();
  });

  it("requires exactly one commitmentIds entry with a commitmentId", () => {
    expect(
      GetCommitmentSpendInputSchema.safeParse({ profileId: "p1", commitmentIds: [] }).success,
    ).toBe(false);
    expect(
      GetCommitmentSpendInputSchema.safeParse({
        profileId: "p1",
        commitmentIds: [{ commitmentId: "c1" }, { commitmentId: "c2" }],
      }).success,
    ).toBe(false);
    expect(
      GetCommitmentSpendInputSchema.safeParse({
        profileId: "p1",
        commitmentIds: [{ commitmentId: "c1" }],
      }).success,
    ).toBe(true);
  });

  it("accepts an optional spendDimension breakdown", () => {
    expect(
      GetCommitmentSpendInputSchema.safeParse({
        profileId: "p1",
        commitmentIds: [
          { commitmentId: "c1", spendDimension: { campaignId: "cmp-1" } },
        ],
      }).success,
    ).toBe(true);
  });

  it("calls retrieveCommitmentSpend with the wrapped request body", async () => {
    const body = { success: [], error: [] };
    mockRetrieveSpend.mockResolvedValueOnce(body);

    await getCommitmentSpendLogic(
      {
        profileId: "1234567890",
        commitmentIds: [{ commitmentId: "c1" }],
      },
      baseContext,
      baseSdkContext,
    );

    expect(mockRetrieveSpend).toHaveBeenCalledWith(
      { commitmentIds: [{ commitmentId: "c1" }] },
      baseContext,
    );
  });

  it("formatter prepends <S> succeeded, <E> failed", () => {
    const out = getCommitmentSpendResponseFormatter({
      response: {
        success: [
          {
            commitmentSpend: {
              accruedToDateTime: "2026-05-28T00:00:00+00:00",
              commitmentId: { commitmentId: "c1" },
              currencyCode: "USD",
              spendDimensionType: "COMMITMENT",
            },
            index: 0,
          },
        ],
        error: [],
      },
      timestamp: "2026-05-28T12:00:00.000Z",
    } as never);
    expect(out[0].text).toMatch(/^1 succeeded, 0 failed/);
  });
});

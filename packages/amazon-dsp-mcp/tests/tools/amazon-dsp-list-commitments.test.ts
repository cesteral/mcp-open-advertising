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
  listCommitmentsLogic,
  listCommitmentsTool,
  ListCommitmentsInputSchema,
} from "../../src/mcp-server/tools/definitions/list-commitments.tool.js";

const mockListCommitments = vi.fn();

beforeEach(() => {
  mockListCommitments.mockReset();
  mockResolveSession.mockReturnValue({
    amazonDspV1Service: { listCommitments: mockListCommitments },
  } as never);
});

const baseContext = { requestId: "test-req" } as never;
const baseSdkContext = { sessionId: "test-session" } as never;

describe("amazon_dsp_list_commitments", () => {
  it("is a plain readOnly tool with no cesteral governance annotation (manifest-surface precedent)", () => {
    expect(listCommitmentsTool.name).toBe("amazon_dsp_list_commitments");
    expect(listCommitmentsTool.annotations.readOnlyHint).toBe(true);
    expect((listCommitmentsTool.annotations as { cesteral?: unknown }).cesteral).toBeUndefined();
  });

  it("input schema enforces maxResults in the 1..50 range", () => {
    expect(ListCommitmentsInputSchema.safeParse({ profileId: "p1", maxResults: 0 }).success).toBe(
      false
    );
    expect(ListCommitmentsInputSchema.safeParse({ profileId: "p1", maxResults: 51 }).success).toBe(
      false
    );
    expect(ListCommitmentsInputSchema.safeParse({ profileId: "p1", maxResults: 25 }).success).toBe(
      true
    );
    expect(ListCommitmentsInputSchema.safeParse({ profileId: "p1" }).success).toBe(true);
  });

  it("calls amazonDspV1Service.listCommitments and returns { commitments, nextToken? }", async () => {
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
    mockListCommitments.mockResolvedValueOnce({
      commitments: [sampleCommitment],
      nextToken: "tok-2",
    });

    const result = await listCommitmentsLogic(
      { profileId: "1234567890", maxResults: 25 },
      baseContext,
      baseSdkContext
    );

    expect(mockListCommitments).toHaveBeenCalledWith(
      { nextToken: undefined, maxResults: 25 },
      baseContext
    );
    expect(result.commitments).toEqual([sampleCommitment]);
    expect(result.nextToken).toBe("tok-2");
    expect(result.timestamp).toBeDefined();
  });

  it("returns an empty commitments array (and no nextToken) when Amazon omits both fields", async () => {
    mockListCommitments.mockResolvedValueOnce({});
    const result = await listCommitmentsLogic(
      { profileId: "1234567890" },
      baseContext,
      baseSdkContext
    );
    expect(result.commitments).toEqual([]);
    expect(result.nextToken).toBeUndefined();
  });
});

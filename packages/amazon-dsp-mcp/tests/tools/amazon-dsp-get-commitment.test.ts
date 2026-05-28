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

import { resolveSessionServicesFromStore, McpError, JsonRpcErrorCode } from "@cesteral/shared";
const mockResolveSession = vi.mocked(resolveSessionServicesFromStore);

import {
  getCommitmentLogic,
  getCommitmentTool,
} from "../../src/mcp-server/tools/definitions/get-commitment.tool.js";

const mockGetCommitment = vi.fn();

beforeEach(() => {
  mockGetCommitment.mockReset();
  mockResolveSession.mockReturnValue({
    amazonDspV1Service: { getCommitment: mockGetCommitment },
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

describe("amazon_dsp_get_commitment", () => {
  it("has the canonical tool name and full read-side cesteral annotation", () => {
    expect(getCommitmentTool.name).toBe("amazon_dsp_get_commitment");
    expect(getCommitmentTool.annotations.readOnlyHint).toBe(true);
    const cesteral = (getCommitmentTool.annotations as { cesteral?: Record<string, unknown> })
      .cesteral;
    expect(cesteral).toBeDefined();
    expect(cesteral!.kind).toBe("read");
    expect(cesteral!.contractPlatformSlug).toBe("amazon_dsp");
    expect(cesteral!.contractToolSlug).toBe("get_commitment");
    expect(cesteral!.contractId).toBe("amazon_dsp.get_commitment.v1");
    expect(cesteral!.entityKinds).toEqual(["commitment"]);
    expect(cesteral!.entityIdArgs).toEqual(["commitmentId"]);
  });

  it("calls amazonDspV1Service.getCommitment(commitmentId) and returns { commitment, timestamp }", async () => {
    mockGetCommitment.mockResolvedValueOnce(sampleCommitment);
    const result = await getCommitmentLogic(
      { profileId: "1234567890", commitmentId: "c1" },
      baseContext,
      baseSdkContext,
    );
    expect(mockGetCommitment).toHaveBeenCalledWith("c1", baseContext);
    expect(result.commitment).toEqual(sampleCommitment);
    expect(result.timestamp).toBeDefined();
  });

  it("propagates service McpError(InvalidParams) when Amazon returns the id in error[]", async () => {
    mockGetCommitment.mockRejectedValueOnce(
      new McpError(
        JsonRpcErrorCode.InvalidParams,
        "Amazon DSP could not retrieve commitment missing: not found",
        { code: "NOT_FOUND" },
      ),
    );
    await expect(
      getCommitmentLogic(
        { profileId: "1234567890", commitmentId: "missing" },
        baseContext,
        baseSdkContext,
      ),
    ).rejects.toMatchObject({
      message: expect.stringContaining("not found"),
    });
  });
});

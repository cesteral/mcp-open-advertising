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
  updateCommitmentLogic,
  updateCommitmentTool,
  UpdateCommitmentInputSchema,
} from "../../src/mcp-server/tools/definitions/update-commitment.tool.js";

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

describe("amazon_dsp_update_commitment — governed write annotation", () => {
  it("declares kind=write, single update operation, singular read partner, full contract", () => {
    expect(updateCommitmentTool.name).toBe("amazon_dsp_update_commitment");
    const cesteral = (updateCommitmentTool.annotations as { cesteral?: Record<string, unknown> })
      .cesteral;
    expect(cesteral).toBeDefined();
    expect(cesteral!.kind).toBe("write");
    expect(cesteral!.operation).toEqual(["update"]);
    expect(cesteral!.contractPlatformSlug).toBe("amazon_dsp");
    expect(cesteral!.contractToolSlug).toBe("update_commitment");
    expect(cesteral!.contractId).toBe("amazon_dsp.update_commitment.v1");
    expect(cesteral!.entityKinds).toEqual(["commitment"]);
    expect(cesteral!.entityIdArgs).toEqual(["commitmentId"]);
    expect(cesteral!.readPartner).toEqual({
      toolName: "amazon_dsp_get_commitment",
      argMap: { profileId: "profileId", commitmentId: "commitmentId" },
    });
    expect(cesteral!.requiresValidation).toBe(true);
    expect(cesteral!.requiresSimulation).toBe(true);
    expect(cesteral!.supportsDryRun).toBe(true);
    expect(cesteral!.supportsBeforeAfterSnapshot).toBe(true);
    expect(updateCommitmentTool.annotations.destructiveHint).toBe(false);
    expect(updateCommitmentTool.annotations.idempotentHint).toBe(true);
  });
});

describe("amazon_dsp_update_commitment — input schema parse", () => {
  it("accepts the documented input shape with only patched fields in data", () => {
    const r = UpdateCommitmentInputSchema.safeParse({
      profileId: "1234567890",
      commitmentId: "c-001",
      data: { committedSpend: 150000 },
    });
    expect(r.success).toBe(true);
  });

  it("accepts an empty data patch (no-op update is still well-formed input)", () => {
    const r = UpdateCommitmentInputSchema.safeParse({
      profileId: "1234567890",
      commitmentId: "c-001",
      data: {},
    });
    expect(r.success).toBe(true);
  });

  it("REJECTS a smuggled data.commitmentId — top-level is the only authoritative source", () => {
    const r = UpdateCommitmentInputSchema.safeParse({
      profileId: "1234567890",
      commitmentId: "c-001",
      data: { commitmentId: "different-id", committedSpend: 150000 },
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const msg = r.error.issues.map((i) => i.message).join(" | ");
      expect(msg).toMatch(/data\.commitmentId is forbidden/);
    }
  });

  it("accepts forward-compatible passthrough fields in data (Amazon may add new ones)", () => {
    const r = UpdateCommitmentInputSchema.safeParse({
      profileId: "1234567890",
      commitmentId: "c-001",
      data: { committedSpend: 200, someFutureField: "x" },
    });
    expect(r.success).toBe(true);
  });

  it("rejects an out-of-enum fulfillmentLevel before the wire", () => {
    const r = UpdateCommitmentInputSchema.safeParse({
      profileId: "1234567890",
      commitmentId: "c-001",
      data: { fulfillmentLevel: "LEVEL_99" },
    });
    expect(r.success).toBe(false);
  });
});

describe("amazon_dsp_update_commitment — wet run", () => {
  it("captures before via getCommitment, calls updateCommitment, returns before+after+dispatchedCapability", async () => {
    mockGetCommitment.mockResolvedValueOnce(currentCommitment);
    const updated = { ...currentCommitment, committedSpend: 200 };
    mockUpdateCommitment.mockResolvedValueOnce(updated);

    const result = await updateCommitmentLogic(
      {
        profileId: "1234567890",
        commitmentId: "c1",
        data: { committedSpend: 200 },
      },
      baseContext,
      baseSdkContext,
    );

    expect(mockGetCommitment).toHaveBeenCalledWith("c1", baseContext);
    expect(mockUpdateCommitment).toHaveBeenCalledWith(
      { commitmentId: "c1", committedSpend: 200 },
      baseContext,
    );

    expect(result.updated).toBe(true);
    expect(result.commitment).toEqual(updated);
    expect(result.commitmentId).toBe("c1");
    expect(result.dispatchedCapability).toEqual({
      operation: "update",
      canonicalEntityKind: "commitment",
    });
    expect(result.before?.entityKind).toBe("commitment");
    expect(result.before?.platformEntityId).toBe("c1");
    expect(result.before?.budget?.lifetime?.amountMinor).toBe(10000); // 100 USD -> 10000 minor
    expect(result.after?.entityKind).toBe("commitment");
    expect(result.after?.budget?.lifetime?.amountMinor).toBe(20000); // 200 USD -> 20000 minor
  });

  it("propagates service McpError(InvalidParams) on per-item Amazon rejection", async () => {
    mockGetCommitment.mockResolvedValueOnce(currentCommitment);
    mockUpdateCommitment.mockRejectedValueOnce(
      new McpError(
        JsonRpcErrorCode.InvalidParams,
        "Amazon DSP rejected the update commitment request: Overlapping dates",
        { code: "FIELD_VALUE_IS_INVALID", fieldLocation: "endDateTime" },
      ),
    );
    await expect(
      updateCommitmentLogic(
        {
          profileId: "1234567890",
          commitmentId: "c1",
          data: { endDateTime: "2025-01-01T00:00:00+00:00" },
        },
        baseContext,
        baseSdkContext,
      ),
    ).rejects.toMatchObject({
      message: expect.stringContaining("Overlapping dates"),
      code: JsonRpcErrorCode.InvalidParams,
    });
  });

  it("leaves before undefined when the pre-read fails — wet write still proceeds", async () => {
    mockGetCommitment.mockRejectedValueOnce(new Error("transient network error"));
    const updated = { ...currentCommitment, committedSpend: 200 };
    mockUpdateCommitment.mockResolvedValueOnce(updated);

    const result = await updateCommitmentLogic(
      {
        profileId: "1234567890",
        commitmentId: "c1",
        data: { committedSpend: 200 },
      },
      baseContext,
      baseSdkContext,
    );

    expect(result.before).toBeUndefined();
    expect(result.after?.budget?.lifetime?.amountMinor).toBe(20000);
    expect(result.updated).toBe(true);
  });
});

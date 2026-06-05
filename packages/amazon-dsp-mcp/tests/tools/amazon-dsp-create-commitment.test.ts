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
  createCommitmentLogic,
  createCommitmentTool,
} from "../../src/mcp-server/tools/definitions/create-commitment.tool.js";

const mockCreateCommitment = vi.fn();

beforeEach(() => {
  mockCreateCommitment.mockReset();
  mockResolveSession.mockReturnValue({
    amazonDspV1Service: { createCommitment: mockCreateCommitment },
  } as never);
});

const baseContext = { requestId: "test-req" } as never;
const baseSdkContext = { sessionId: "test-session" } as never;

const validInput = {
  profileId: "1234567890",
  data: {
    commitmentName: "Q3 Upfront",
    committedSpend: 100,
    currencyCode: "USD",
    endDateTime: "2027-01-01T00:00:00+00:00",
    fulfillmentLevel: "LEVEL_5",
    spendCalculationMode: "CAMPAIGN",
    startDateTime: "2026-01-01T00:00:00+00:00",
  },
};

const createdCommitment = {
  commitmentId: "c-new",
  ...validInput.data,
};

describe("amazon_dsp_create_commitment", () => {
  it("is a destructive entity-class governed create write", () => {
    expect(createCommitmentTool.name).toBe("amazon_dsp_create_commitment");
    expect(createCommitmentTool.annotations.readOnlyHint).toBe(false);
    expect(createCommitmentTool.annotations.destructiveHint).toBe(true);
    expect(createCommitmentTool.annotations.openWorldHint).toBe(false);
    const cesteral = (createCommitmentTool.annotations as { cesteral?: any }).cesteral;
    expect(cesteral?.kind).toBe("write");
    expect(cesteral?.writeClass).toBe("entity");
    expect(cesteral?.operation).toEqual(["create"]);
    expect(cesteral?.entityKinds).toEqual(["commitment"]);
    expect(cesteral?.contractId).toBe("amazon_dsp.create_commitment.v1");
  });

  it("forwards input.data to amazonDspV1Service.createCommitment and returns the created commitment + after snapshot", async () => {
    mockCreateCommitment.mockResolvedValueOnce(createdCommitment);

    const result = await createCommitmentLogic(validInput, baseContext, baseSdkContext);

    expect(mockCreateCommitment).toHaveBeenCalledWith(validInput.data, baseContext);
    expect(result.commitment).toEqual(createdCommitment);
    expect(result.timestamp).toBeDefined();
    // Entity-class governed create: null-kind never applies — capability is a
    // commitment create, and an `after` snapshot is captured (no `before`).
    expect(result.dispatchedCapability).toEqual({
      operation: "create",
      canonicalEntityKind: "commitment",
    });
    expect(result.after?.entityKind).toBe("commitment");
  });

  it("dry_run validates symbolically and creates nothing", async () => {
    const result = await createCommitmentLogic(
      { ...validInput, dry_run: true } as any,
      baseContext,
      baseSdkContext
    );
    expect(mockCreateCommitment).not.toHaveBeenCalled();
    expect(result.commitment).toBeUndefined();
    expect(result.dryRun?.validationSource).toBe("symbolic");
    expect(result.dryRun?.expectedStateSource).toBe("server_symbolic_apply");
    expect(result.dispatchedCapability.canonicalEntityKind).toBe("commitment");
  });

  it("propagates service McpError(InvalidParams) on per-item Amazon rejection", async () => {
    mockCreateCommitment.mockRejectedValueOnce(
      new McpError(
        JsonRpcErrorCode.InvalidParams,
        "Amazon DSP rejected the create commitment request: Overlapping dates",
        { code: "FIELD_VALUE_IS_INVALID", fieldLocation: "startDateTime" }
      )
    );
    await expect(
      createCommitmentLogic(validInput, baseContext, baseSdkContext)
    ).rejects.toMatchObject({
      message: expect.stringContaining("Overlapping dates"),
      code: JsonRpcErrorCode.InvalidParams,
    });
  });
});

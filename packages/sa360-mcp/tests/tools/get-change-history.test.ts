import { describe, it, expect, vi } from "vitest";

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: vi.fn(),
}));

import { JsonRpcErrorCode, McpError } from "@cesteral/shared";
import { resolveSessionServices } from "../../src/mcp-server/tools/utils/resolve-session.js";
import {
  GetChangeHistoryInputSchema,
  getChangeHistoryLogic,
  getChangeHistoryTool,
} from "../../src/mcp-server/tools/definitions/get-change-history.tool.js";
import { isV0Field, isV0RowResource } from "../helpers/v0-field-catalog.js";

describe("GetChangeHistoryInputSchema", () => {
  const validInput = {
    customerId: "1234567890",
    startDate: "2026-03-01",
    endDate: "2026-03-16",
  };

  it("accepts valid input", () => {
    const result = GetChangeHistoryInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("defaults limit to 100", () => {
    const result = GetChangeHistoryInputSchema.parse(validInput);
    expect(result.limit).toBe(100);
  });

  it("requires numeric customerId", () => {
    const result = GetChangeHistoryInputSchema.safeParse({
      ...validInput,
      customerId: "abc",
    });
    expect(result.success).toBe(false);
  });

  it("requires startDate in YYYY-MM-DD format", () => {
    const result = GetChangeHistoryInputSchema.safeParse({
      ...validInput,
      startDate: "03-01-2026",
    });
    expect(result.success).toBe(false);
  });

  it("requires endDate in YYYY-MM-DD format", () => {
    const result = GetChangeHistoryInputSchema.safeParse({
      ...validInput,
      endDate: "March 16",
    });
    expect(result.success).toBe(false);
  });

  it("requires startDate", () => {
    const { startDate: _, ...rest } = validInput;
    const result = GetChangeHistoryInputSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("requires endDate", () => {
    const { endDate: _, ...rest } = validInput;
    const result = GetChangeHistoryInputSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("accepts optional resourceType", () => {
    const result = GetChangeHistoryInputSchema.safeParse({
      ...validInput,
      resourceType: "CAMPAIGN",
    });
    expect(result.success).toBe(true);
  });

  it("accepts ChangeEventResourceType values", () => {
    const types = [
      "CAMPAIGN",
      "AD_GROUP",
      "AD",
      "AD_GROUP_AD",
      "AD_GROUP_CRITERION",
      "CAMPAIGN_CRITERION",
    ];
    for (const resourceType of types) {
      const result = GetChangeHistoryInputSchema.safeParse({ ...validInput, resourceType });
      expect(result.success, `Failed for resourceType: ${resourceType}`).toBe(true);
    }
  });

  it("rejects KEYWORD / CRITERION, which are not ChangeEventResourceType values", () => {
    for (const resourceType of ["KEYWORD", "CRITERION"]) {
      expect(GetChangeHistoryInputSchema.safeParse({ ...validInput, resourceType }).success).toBe(
        false
      );
    }
  });

  it("rejects invalid resourceType", () => {
    const result = GetChangeHistoryInputSchema.safeParse({
      ...validInput,
      resourceType: "INVALID",
    });
    expect(result.success).toBe(false);
  });

  it("accepts custom limit", () => {
    const result = GetChangeHistoryInputSchema.safeParse({
      ...validInput,
      limit: 50,
    });
    expect(result.success).toBe(true);
  });

  it("rejects limit over 10000", () => {
    const result = GetChangeHistoryInputSchema.safeParse({
      ...validInput,
      limit: 10001,
    });
    expect(result.success).toBe(false);
  });

  it("rejects limit less than 1", () => {
    const result = GetChangeHistoryInputSchema.safeParse({
      ...validInput,
      limit: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe("getChangeHistoryLogic on Reporting API v0", () => {
  it("v0 has no change_event resource (precondition for refusing)", () => {
    expect(isV0RowResource("change_event")).toBe(false);
    expect(isV0RowResource("change_status")).toBe(false);
  });

  it("fails clearly without calling the API", async () => {
    const sa360Search = vi.fn();
    vi.mocked(resolveSessionServices).mockReturnValue({ sa360Service: { sa360Search } } as any);

    const err = await getChangeHistoryLogic(GetChangeHistoryInputSchema.parse(validInputForLogic), {
      requestId: "r",
    } as any).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(McpError);
    expect((err as McpError).code).toBe(JsonRpcErrorCode.InvalidRequest);
    expect((err as McpError).message).toMatch(/change_event/);
    expect((err as McpError).message).toMatch(/sa360_gaql_search/);
    expect(sa360Search).not.toHaveBeenCalled();
  });

  it("describes itself as unavailable and suggests only v0-valid fields", () => {
    expect(getChangeHistoryTool.description).toMatch(/^UNAVAILABLE/);
    for (const field of [
      "campaign.last_modified_time",
      "ad_group.last_modified_time",
      "ad_group_ad.last_modified_time",
      "ad_group_criterion.last_modified_time",
      "campaign_criterion.last_modified_time",
    ]) {
      expect(isV0Field(field), field).toBe(true);
    }
  });
});

const validInputForLogic = {
  customerId: "1234567890",
  startDate: "2026-03-01",
  endDate: "2026-03-16",
};

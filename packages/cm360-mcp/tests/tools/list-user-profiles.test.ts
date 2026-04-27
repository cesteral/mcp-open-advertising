import { describe, it, expect, vi, beforeEach } from "vitest";

const mockState = vi.hoisted(() => ({
  cm360Service: {
    getEntity: vi.fn(),
    createEntity: vi.fn(),
    updateEntity: vi.fn(),
    deleteEntity: vi.fn(),
    listEntities: vi.fn(),
    listUserProfiles: vi.fn(),
    listTargetingOptions: vi.fn(),
  },
  cm360ReportingService: {
    runReport: vi.fn(),
    createReport: vi.fn(),
    checkReportFile: vi.fn(),
    downloadReportFile: vi.fn(),
  },
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: vi.fn(() => mockState),
}));

vi.mock("../../src/mcp-server/tools/utils/entity-mapping.js", () => ({
  getEntityTypeEnum: () => [
    "campaign",
    "placement",
    "ad",
    "creative",
    "site",
    "advertiser",
    "floodlightActivity",
    "floodlightConfiguration",
  ],
  getDeletableEntityTypeEnum: () => ["floodlightActivity"],
}));

import {
  ListUserProfilesInputSchema,
  listUserProfilesLogic,
  listUserProfilesResponseFormatter,
} from "../../src/mcp-server/tools/definitions/list-user-profiles.tool.js";

const mockContext = { requestId: "test-req" } as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ListUserProfilesInputSchema", () => {
  it("accepts empty object", () => {
    const result = ListUserProfilesInputSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts call with no arguments", () => {
    // When MCP tools are called with no arguments, the schema receives {}
    const result = ListUserProfilesInputSchema.safeParse({});
    expect(result.success).toBe(true);
    expect(result.data).toEqual({});
  });

  it("strips unknown fields", () => {
    const result = ListUserProfilesInputSchema.safeParse({
      unexpectedField: "value",
    });
    // Zod strips unknown fields by default
    if (result.success) {
      expect((result.data as any).unexpectedField).toBeUndefined();
    }
  });

  it("accepts undefined input gracefully", () => {
    // safeParse with undefined should fail since it's not an object
    const result = ListUserProfilesInputSchema.safeParse(undefined);
    expect(result.success).toBe(false);
  });

  it("rejects non-object input", () => {
    const result = ListUserProfilesInputSchema.safeParse("not-an-object");
    expect(result.success).toBe(false);
  });

  it("rejects null input", () => {
    const result = ListUserProfilesInputSchema.safeParse(null);
    expect(result.success).toBe(false);
  });
});

describe("listUserProfilesLogic", () => {
  it("calls cm360Service.listUserProfiles", async () => {
    mockState.cm360Service.listUserProfiles.mockResolvedValue({
      items: [{ profileId: "1", userName: "user1" }],
    });

    await listUserProfilesLogic({} as any, mockContext);

    expect(mockState.cm360Service.listUserProfiles).toHaveBeenCalledWith(mockContext);
  });

  it("extracts profiles from result.items", async () => {
    const items = [{ profileId: "1" }, { profileId: "2" }];
    mockState.cm360Service.listUserProfiles.mockResolvedValue({ items });

    const result = await listUserProfilesLogic({} as any, mockContext);

    expect(result.profiles).toEqual(items);
  });

  it("returns empty array when result.items is undefined", async () => {
    mockState.cm360Service.listUserProfiles.mockResolvedValue({});

    const result = await listUserProfilesLogic({} as any, mockContext);

    expect(result.profiles).toEqual([]);
    expect(result.totalCount).toBe(0);
  });

  it("returns totalCount matching profiles length", async () => {
    const items = [{ profileId: "1" }, { profileId: "2" }, { profileId: "3" }];
    mockState.cm360Service.listUserProfiles.mockResolvedValue({ items });

    const result = await listUserProfilesLogic({} as any, mockContext);

    expect(result.totalCount).toBe(3);
  });
});

describe("listUserProfilesResponseFormatter", () => {
  it("includes profile count", () => {
    const result = listUserProfilesResponseFormatter({
      profiles: [{ profileId: "1" }, { profileId: "2" }],
      totalCount: 2,
      timestamp: "2026-01-01T00:00:00.000Z",
    });
    expect(result[0].text).toContain("Found 2 user profiles");
  });

  it("shows 'No profiles found' when empty", () => {
    const result = listUserProfilesResponseFormatter({
      profiles: [],
      totalCount: 0,
      timestamp: "2026-01-01T00:00:00.000Z",
    });
    expect(result[0].text).toContain("No profiles found");
  });
});

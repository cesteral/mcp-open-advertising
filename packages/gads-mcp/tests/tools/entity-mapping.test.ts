import { describe, it, expect } from "vitest";
import {
  getStatusCapableEntityTypes,
  getStatusCapableEntityTypeEnum,
  getSupportedEntityTypes,
} from "../../src/mcp-server/tools/utils/entity-mapping.js";

describe("getStatusCapableEntityTypes", () => {
  it("includes entity types with statusField defined", () => {
    const types = getStatusCapableEntityTypes();
    expect(types).toContain("campaign");
    expect(types).toContain("adGroup");
    expect(types).toContain("ad");
    expect(types).toContain("keyword");
  });

  it("excludes entity types without statusField", () => {
    const types = getStatusCapableEntityTypes();
    expect(types).not.toContain("campaignBudget");
    expect(types).not.toContain("asset");
  });

  it("is a subset of all supported entity types", () => {
    const all = getSupportedEntityTypes();
    const statusCapable = getStatusCapableEntityTypes();
    for (const type of statusCapable) {
      expect(all).toContain(type);
    }
    expect(statusCapable.length).toBeLessThan(all.length);
  });
});

describe("getStatusCapableEntityTypeEnum", () => {
  it("returns non-empty tuple", () => {
    const enumTuple = getStatusCapableEntityTypeEnum();
    expect(enumTuple.length).toBeGreaterThan(0);
  });
});

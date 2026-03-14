import { describe, it, expect } from "vitest";
import {
  getEntityConfig,
  getSupportedEntityTypes,
  getEntityTypeEnum,
  type MsAdsEntityType,
} from "../../src/mcp-server/tools/utils/entity-mapping.js";

describe("MsAds Entity Mapping", () => {
  it("returns all 8 supported entity types", () => {
    const types = getSupportedEntityTypes();
    expect(types).toHaveLength(8);
    expect(types).toContain("campaign");
    expect(types).toContain("adGroup");
    expect(types).toContain("ad");
    expect(types).toContain("keyword");
    expect(types).toContain("budget");
    expect(types).toContain("adExtension");
    expect(types).toContain("audience");
    expect(types).toContain("label");
  });

  it("campaign config has correct operations", () => {
    const config = getEntityConfig("campaign");
    expect(config.addOperation).toBe("/Campaigns/Add");
    expect(config.getByAccountOperation).toBe("/Campaigns/GetByAccountId");
    expect(config.getByIdsOperation).toBe("/Campaigns/GetByIds");
    expect(config.updateOperation).toBe("/Campaigns/Update");
    expect(config.deleteOperation).toBe("/Campaigns/Delete");
    expect(config.idField).toBe("Id");
    expect(config.pluralName).toBe("Campaigns");
  });

  it("adGroup config has correct operations", () => {
    const config = getEntityConfig("adGroup");
    expect(config.addOperation).toBe("/AdGroups/Add");
    expect(config.getByParentOperation).toBe("/AdGroups/GetByCampaignId");
    expect(config.parentIdField).toBe("CampaignId");
  });

  it("keyword config has correct operations", () => {
    const config = getEntityConfig("keyword");
    expect(config.addOperation).toBe("/Keywords/Add");
    expect(config.getByParentOperation).toBe("/Keywords/GetByAdGroupId");
    expect(config.parentIdField).toBe("AdGroupId");
  });

  it("getEntityTypeEnum returns tuple for Zod", () => {
    const tuple = getEntityTypeEnum();
    expect(tuple.length).toBeGreaterThan(0);
    expect(typeof tuple[0]).toBe("string");
  });

  it("throws for unknown entity type", () => {
    expect(() => getEntityConfig("unknown" as MsAdsEntityType)).toThrow("Unknown");
  });
});

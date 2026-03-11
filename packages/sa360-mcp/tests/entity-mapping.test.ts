import { describe, it, expect } from "vitest";
import {
  getEntityConfig,
  getSupportedEntityTypes,
  getEntityTypeEnum,
  type SA360EntityType,
} from "../src/mcp-server/tools/utils/entity-mapping.js";

describe("SA360 Entity Mapping", () => {
  it("should return 8 supported entity types", () => {
    const types = getSupportedEntityTypes();
    expect(types).toHaveLength(8);
    expect(types).toContain("customer");
    expect(types).toContain("campaign");
    expect(types).toContain("adGroup");
    expect(types).toContain("adGroupAd");
    expect(types).toContain("adGroupCriterion");
    expect(types).toContain("campaignCriterion");
    expect(types).toContain("biddingStrategy");
    expect(types).toContain("conversionAction");
  });

  it("should return entity type enum with at least one element", () => {
    const enumValues = getEntityTypeEnum();
    expect(enumValues.length).toBeGreaterThanOrEqual(1);
    expect(enumValues[0]).toBe("customer");
  });

  it("should return config for each entity type", () => {
    const types = getSupportedEntityTypes();
    for (const type of types) {
      const config = getEntityConfig(type);
      expect(config).toBeDefined();
      expect(config.queryResource).toBeTruthy();
      expect(config.idField).toBeTruthy();
    }
  });

  it("should throw for unknown entity type", () => {
    expect(() => getEntityConfig("unknownType" as SA360EntityType)).toThrow(
      "Unknown SA360 entity type: unknownType"
    );
  });

  it("should have correct config for campaign", () => {
    const config = getEntityConfig("campaign");
    expect(config.queryResource).toBe("campaign");
    expect(config.idField).toBe("campaign.id");
    expect(config.statusField).toBe("campaign.status");
    expect(config.nameField).toBe("campaign.name");
  });

  it("should have correct config for adGroupCriterion", () => {
    const config = getEntityConfig("adGroupCriterion");
    expect(config.queryResource).toBe("ad_group_criterion");
    expect(config.idField).toBe("ad_group_criterion.criterion_id");
    expect(config.statusField).toBe("ad_group_criterion.status");
  });

  it("should have correct config for customer", () => {
    const config = getEntityConfig("customer");
    expect(config.queryResource).toBe("customer");
    expect(config.idField).toBe("customer.id");
    expect(config.nameField).toBe("customer.descriptive_name");
    expect(config.statusField).toBeUndefined();
  });
});

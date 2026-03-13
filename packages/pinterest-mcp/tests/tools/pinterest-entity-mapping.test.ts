import { describe, it, expect } from "vitest";
import {
  getEntityConfig,
  getSupportedEntityTypes,
  getEntityTypeEnum,
  getDuplicateSupportedEntityTypes,
  getDuplicateEntityTypeEnum,
  interpolatePath,
  type PinterestEntityType,
} from "../../src/mcp-server/tools/utils/entity-mapping.js";

describe("Pinterest Entity Mapping", () => {
  describe("getEntityConfig()", () => {
    it("campaign listPath uses Pinterest v5 structure", () => {
      expect(getEntityConfig("campaign").listPath).toBe("/v5/ad_accounts/{adAccountId}/campaigns");
    });

    it("adGroup uses /ad_groups path", () => {
      expect(getEntityConfig("adGroup").listPath).toBe("/v5/ad_accounts/{adAccountId}/ad_groups");
    });

    it("ad uses /ads path", () => {
      expect(getEntityConfig("ad").listPath).toBe("/v5/ad_accounts/{adAccountId}/ads");
    });

    it("creative uses /v5/pins path", () => {
      expect(getEntityConfig("creative").createPath).toBe("/v5/pins");
    });

    it("campaign idField is 'id' (not campaign_id)", () => {
      expect(getEntityConfig("campaign").idField).toBe("id");
    });

    it("adGroup idField is 'id'", () => {
      expect(getEntityConfig("adGroup").idField).toBe("id");
    });

    it("ad idField is 'id'", () => {
      expect(getEntityConfig("ad").idField).toBe("id");
    });

    it("creative idField is 'id'", () => {
      expect(getEntityConfig("creative").idField).toBe("id");
    });

    it("campaign deleteIdsParam is 'campaign_ids'", () => {
      expect(getEntityConfig("campaign").deleteIdsParam).toBe("campaign_ids");
    });

    it("adGroup deleteIdsParam is 'ad_group_ids'", () => {
      expect(getEntityConfig("adGroup").deleteIdsParam).toBe("ad_group_ids");
    });

    it("ad deleteIdsParam is 'ad_ids'", () => {
      expect(getEntityConfig("ad").deleteIdsParam).toBe("ad_ids");
    });

    it("creative deleteIdsParam is 'pin_id'", () => {
      expect(getEntityConfig("creative").deleteIdsParam).toBe("pin_id");
    });

    it("campaign displayName is 'Campaign'", () => {
      expect(getEntityConfig("campaign").displayName).toBe("Campaign");
    });

    it("creative displayName is 'Pin (Creative)'", () => {
      expect(getEntityConfig("creative").displayName).toBe("Pin (Creative)");
    });

    it("all entity types have defaultFields", () => {
      for (const type of getSupportedEntityTypes()) {
        const config = getEntityConfig(type);
        expect(config.defaultFields).toBeDefined();
        expect(config.defaultFields.length).toBeGreaterThan(0);
      }
    });

    it("throws for unknown entity type", () => {
      expect(() => getEntityConfig("unknown" as PinterestEntityType)).toThrow(
        "Unknown Pinterest entity type: unknown"
      );
    });
  });

  describe("no path contains /open_api/v1.3/", () => {
    it("no entity path uses TikTok-style /open_api/v1.3/ structure", () => {
      for (const type of getSupportedEntityTypes()) {
        const cfg = getEntityConfig(type);
        expect(cfg.listPath).not.toContain("/open_api/v1.3/");
        expect(cfg.createPath).not.toContain("/open_api/v1.3/");
        expect(cfg.updatePath).not.toContain("/open_api/v1.3/");
        expect(cfg.statusUpdatePath).not.toContain("/open_api/v1.3/");
        expect(cfg.deletePath).not.toContain("/open_api/v1.3/");
      }
    });
  });

  describe("campaign paths use /v5/ prefix", () => {
    it("campaign createPath starts with /v5/", () => {
      expect(getEntityConfig("campaign").createPath).toMatch(/^\/v5\//);
    });

    it("all entity paths start with /v5/", () => {
      for (const type of getSupportedEntityTypes()) {
        const cfg = getEntityConfig(type);
        expect(cfg.createPath).toMatch(/^\/v5\//);
        expect(cfg.listPath).toMatch(/^\/v5\//);
      }
    });
  });

  describe("campaign supportsDuplicate is false", () => {
    it("campaign does not support duplication", () => {
      expect(getEntityConfig("campaign").supportsDuplicate).toBe(false);
    });

    it("adGroup does not support duplication", () => {
      expect(getEntityConfig("adGroup").supportsDuplicate).toBe(false);
    });

    it("ad does not support duplication", () => {
      expect(getEntityConfig("ad").supportsDuplicate).toBe(false);
    });

    it("creative does not support duplication", () => {
      expect(getEntityConfig("creative").supportsDuplicate).toBe(false);
    });
  });

  describe("getSupportedEntityTypes()", () => {
    it("returns all four entity types", () => {
      const types = getSupportedEntityTypes();
      expect(types).toContain("campaign");
      expect(types).toContain("adGroup");
      expect(types).toContain("ad");
      expect(types).toContain("creative");
      expect(types).toHaveLength(4);
    });
  });

  describe("getEntityTypeEnum()", () => {
    it("returns a non-empty tuple", () => {
      const enumTypes = getEntityTypeEnum();
      expect(enumTypes.length).toBeGreaterThan(0);
    });
  });

  describe("getDuplicateSupportedEntityTypes()", () => {
    it("returns empty array since no Pinterest entity supports duplication", () => {
      expect(getDuplicateSupportedEntityTypes()).toHaveLength(0);
    });
  });

  describe("getDuplicateEntityTypeEnum()", () => {
    it("returns empty array", () => {
      expect(getDuplicateEntityTypeEnum()).toHaveLength(0);
    });
  });

  describe("interpolatePath()", () => {
    it("substitutes {adAccountId}", () => {
      expect(
        interpolatePath("/v5/ad_accounts/{adAccountId}/campaigns", { adAccountId: "act_123" })
      ).toBe("/v5/ad_accounts/act_123/campaigns");
    });

    it("substitutes {entityId}", () => {
      expect(
        interpolatePath("/v5/pins/{entityId}", { entityId: "pin_456" })
      ).toBe("/v5/pins/pin_456");
    });

    it("substitutes multiple placeholders", () => {
      expect(
        interpolatePath("/v5/ad_accounts/{adAccountId}/entities/{entityId}", {
          adAccountId: "act_123",
          entityId: "ent_789",
        })
      ).toBe("/v5/ad_accounts/act_123/entities/ent_789");
    });

    it("leaves unmatched placeholders unchanged", () => {
      expect(
        interpolatePath("/v5/ad_accounts/{adAccountId}/campaigns", { advertiserId: "adv_999" })
      ).toBe("/v5/ad_accounts/{adAccountId}/campaigns");
    });

    it("returns path unchanged with empty params", () => {
      expect(interpolatePath("/v5/pins", {})).toBe("/v5/pins");
    });
  });
});

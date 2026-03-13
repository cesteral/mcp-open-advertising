import { describe, it, expect } from "vitest";
import {
  getEntityConfig,
  getSupportedEntityTypes,
  interpolatePath,
} from "../../src/mcp-server/tools/utils/entity-mapping.js";

describe("Snapchat entity mapping", () => {
  describe("campaign paths", () => {
    it("listPath uses /v1/adaccounts/{adAccountId}/campaigns", () => {
      expect(getEntityConfig("campaign").listPath).toBe("/v1/adaccounts/{adAccountId}/campaigns");
    });
    it("createPath uses /v1/adaccounts/{adAccountId}/campaigns", () => {
      expect(getEntityConfig("campaign").createPath).toBe("/v1/adaccounts/{adAccountId}/campaigns");
    });
    it("updatePath uses /v1/campaigns/{entityId}", () => {
      expect(getEntityConfig("campaign").updatePath).toBe("/v1/campaigns/{entityId}");
    });
    it("deletePath uses /v1/campaigns/{entityId}", () => {
      expect(getEntityConfig("campaign").deletePath).toBe("/v1/campaigns/{entityId}");
    });
    it("responseKey is 'campaigns'", () => {
      expect(getEntityConfig("campaign").responseKey).toBe("campaigns");
    });
    it("entityKey is 'campaign'", () => {
      expect(getEntityConfig("campaign").entityKey).toBe("campaign");
    });
    it("idField is 'id'", () => {
      expect(getEntityConfig("campaign").idField).toBe("id");
    });
  });

  describe("adGroup (ad squad) paths", () => {
    it("listPath uses /v1/campaigns/{campaignId}/adsquads", () => {
      expect(getEntityConfig("adGroup").listPath).toBe("/v1/campaigns/{campaignId}/adsquads");
    });
    it("createPath uses /v1/campaigns/{campaignId}/adsquads", () => {
      expect(getEntityConfig("adGroup").createPath).toBe("/v1/campaigns/{campaignId}/adsquads");
    });
    it("updatePath uses /v1/adsquads/{entityId}", () => {
      expect(getEntityConfig("adGroup").updatePath).toBe("/v1/adsquads/{entityId}");
    });
    it("responseKey is 'adsquads'", () => {
      expect(getEntityConfig("adGroup").responseKey).toBe("adsquads");
    });
    it("entityKey is 'adsquad'", () => {
      expect(getEntityConfig("adGroup").entityKey).toBe("adsquad");
    });
  });

  describe("ad paths", () => {
    it("listPath uses /v1/adsquads/{adSquadId}/ads", () => {
      expect(getEntityConfig("ad").listPath).toBe("/v1/adsquads/{adSquadId}/ads");
    });
    it("createPath uses /v1/adsquads/{adSquadId}/ads", () => {
      expect(getEntityConfig("ad").createPath).toBe("/v1/adsquads/{adSquadId}/ads");
    });
    it("updatePath uses /v1/ads/{entityId}", () => {
      expect(getEntityConfig("ad").updatePath).toBe("/v1/ads/{entityId}");
    });
    it("responseKey is 'ads'", () => {
      expect(getEntityConfig("ad").responseKey).toBe("ads");
    });
    it("entityKey is 'ad'", () => {
      expect(getEntityConfig("ad").entityKey).toBe("ad");
    });
  });

  describe("creative paths", () => {
    it("listPath uses /v1/adaccounts/{adAccountId}/creatives", () => {
      expect(getEntityConfig("creative").listPath).toBe("/v1/adaccounts/{adAccountId}/creatives");
    });
    it("updatePath uses /v1/creatives/{entityId}", () => {
      expect(getEntityConfig("creative").updatePath).toBe("/v1/creatives/{entityId}");
    });
    it("responseKey is 'creatives'", () => {
      expect(getEntityConfig("creative").responseKey).toBe("creatives");
    });
    it("entityKey is 'creative'", () => {
      expect(getEntityConfig("creative").entityKey).toBe("creative");
    });
  });

  describe("getSupportedEntityTypes", () => {
    it("returns all 4 entity types", () => {
      const types = getSupportedEntityTypes();
      expect(types).toContain("campaign");
      expect(types).toContain("adGroup");
      expect(types).toContain("ad");
      expect(types).toContain("creative");
      expect(types).toHaveLength(4);
    });
  });

  describe("interpolatePath", () => {
    it("replaces {adAccountId} placeholder", () => {
      expect(interpolatePath("/v1/adaccounts/{adAccountId}/campaigns", { adAccountId: "acct_123" }))
        .toBe("/v1/adaccounts/acct_123/campaigns");
    });
    it("replaces {entityId} placeholder", () => {
      expect(interpolatePath("/v1/campaigns/{entityId}", { entityId: "camp_456" }))
        .toBe("/v1/campaigns/camp_456");
    });
    it("replaces multiple placeholders", () => {
      expect(interpolatePath("/v1/campaigns/{campaignId}/adsquads/{entityId}", { campaignId: "c1", entityId: "sq1" }))
        .toBe("/v1/campaigns/c1/adsquads/sq1");
    });
    it("leaves unmatched placeholders unchanged", () => {
      expect(interpolatePath("/v1/ads/{adSquadId}/ads", { adAccountId: "x" }))
        .toBe("/v1/ads/{adSquadId}/ads");
    });
  });
});

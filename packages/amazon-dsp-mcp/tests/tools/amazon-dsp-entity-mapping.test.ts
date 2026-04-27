import { describe, it, expect } from "vitest";
import {
  getCanonicalEntityType,
  getEntityConfig,
  getSupportedEntityTypes,
  interpolatePath,
} from "../../src/mcp-server/tools/utils/entity-mapping.js";

describe("Amazon DSP entity mapping", () => {
  describe("order (campaign) paths", () => {
    it("listPath is /dsp/orders", () => {
      expect(getEntityConfig("order").listPath).toBe("/dsp/orders");
    });
    it("getPath is /dsp/orders/{entityId}", () => {
      expect(getEntityConfig("order").getPath).toBe("/dsp/orders/{entityId}");
    });
    it("createPath is /dsp/orders", () => {
      expect(getEntityConfig("order").createPath).toBe("/dsp/orders");
    });
    it("updatePath is /dsp/orders/{entityId}", () => {
      expect(getEntityConfig("order").updatePath).toBe("/dsp/orders/{entityId}");
    });
    it("idField is orderId", () => {
      expect(getEntityConfig("order").idField).toBe("orderId");
    });
    it("responseKey is orders", () => {
      expect(getEntityConfig("order").responseKey).toBe("orders");
    });
    it("listFilterParam is advertiserId", () => {
      expect(getEntityConfig("order").listFilterParam).toBe("advertiserId");
    });
  });

  describe("lineItem (adGroup) paths", () => {
    it("listPath is /dsp/lineItems", () => {
      expect(getEntityConfig("lineItem").listPath).toBe("/dsp/lineItems");
    });
    it("getPath is /dsp/lineItems/{entityId}", () => {
      expect(getEntityConfig("lineItem").getPath).toBe("/dsp/lineItems/{entityId}");
    });
    it("idField is lineItemId", () => {
      expect(getEntityConfig("lineItem").idField).toBe("lineItemId");
    });
    it("responseKey is lineItems", () => {
      expect(getEntityConfig("lineItem").responseKey).toBe("lineItems");
    });
    it("listFilterParam is orderId", () => {
      expect(getEntityConfig("lineItem").listFilterParam).toBe("orderId");
    });
  });

  describe("creative paths", () => {
    it("listPath is /dsp/creatives", () => {
      expect(getEntityConfig("creative").listPath).toBe("/dsp/creatives");
    });
    it("idField is creativeId", () => {
      expect(getEntityConfig("creative").idField).toBe("creativeId");
    });
    it("responseKey is creatives", () => {
      expect(getEntityConfig("creative").responseKey).toBe("creatives");
    });
  });

  describe("target and creative association paths", () => {
    it("target listPath is /dsp/targets", () => {
      expect(getEntityConfig("target").listPath).toBe("/dsp/targets");
    });

    it("creativeAssociation listPath is /dsp/creativeAssociations", () => {
      expect(getEntityConfig("creativeAssociation").listPath).toBe("/dsp/creativeAssociations");
    });
  });

  describe("getSupportedEntityTypes", () => {
    it("includes canonical types and compatibility aliases", () => {
      const types = getSupportedEntityTypes();
      expect(types).toContain("order");
      expect(types).toContain("campaign");
      expect(types).toContain("lineItem");
      expect(types).toContain("adGroup");
      expect(types).toContain("creative");
      expect(types).toContain("target");
      expect(types).toContain("creativeAssociation");
    });
  });

  describe("getCanonicalEntityType", () => {
    it("normalizes campaign to order", () => {
      expect(getCanonicalEntityType("campaign")).toBe("order");
    });

    it("normalizes adGroup to lineItem", () => {
      expect(getCanonicalEntityType("adGroup")).toBe("lineItem");
    });
  });

  describe("interpolatePath", () => {
    it("replaces {entityId}", () => {
      expect(interpolatePath("/dsp/orders/{entityId}", { entityId: "ord_1" })).toBe(
        "/dsp/orders/ord_1"
      );
    });
  });
});

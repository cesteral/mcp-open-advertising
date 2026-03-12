import { describe, it, expect } from "vitest";
import {
  buildListQuery,
  buildGetByIdQuery,
} from "../src/mcp-server/tools/utils/query-helpers.js";

describe("SA360 Query Helpers", () => {
  describe("buildListQuery", () => {
    it("should build a basic list query with default fields", () => {
      const query = buildListQuery("campaign");
      expect(query).toContain("SELECT");
      expect(query).toContain("campaign.id");
      expect(query).toContain("campaign.name");
      expect(query).toContain("campaign.status");
      expect(query).toContain("FROM campaign");
      expect(query).not.toContain("WHERE");
    });

    it("should add WHERE clause with filters", () => {
      const query = buildListQuery("campaign", {
        "campaign.status": "= 'ENABLED'",
      });
      expect(query).toContain("WHERE campaign.status = 'ENABLED'");
    });

    it("should add multiple filter conditions with AND", () => {
      const query = buildListQuery("adGroup", {
        "ad_group.status": "= 'ENABLED'",
        "ad_group.campaign": "= 'customers/123/campaigns/456'",
      });
      expect(query).toContain("WHERE");
      expect(query).toContain("AND");
      expect(query).toContain("ad_group.status = 'ENABLED'");
    });

    it("should auto-quote filter values without operators", () => {
      const query = buildListQuery("campaign", {
        "campaign.name": "My Campaign",
      });
      expect(query).toContain("campaign.name = 'My Campaign'");
    });

    it("should escape single quotes in filter values", () => {
      const query = buildListQuery("campaign", {
        "campaign.name": "O'Brien's Campaign",
      });
      expect(query).toContain("O\\'Brien\\'s Campaign");
    });

    it("should add ORDER BY clause", () => {
      const query = buildListQuery("campaign", undefined, "campaign.name ASC");
      expect(query).toContain("ORDER BY campaign.name ASC");
    });

    it("should build query for all entity types", () => {
      const types = [
        "customer",
        "campaign",
        "adGroup",
        "adGroupAd",
        "adGroupCriterion",
        "campaignCriterion",
        "biddingStrategy",
        "conversionAction",
      ] as const;

      for (const type of types) {
        const query = buildListQuery(type);
        expect(query).toContain("SELECT");
        expect(query).toContain("FROM");
      }
    });

    it("should reject filter field names with invalid characters", () => {
      expect(() =>
        buildListQuery("campaign", { "campaign.status; DROP TABLE": "= 'ENABLED'" })
      ).toThrow("Invalid filter field name");
    });

    it("should reject filter field names starting with numbers", () => {
      expect(() =>
        buildListQuery("campaign", { "1invalid": "= 'ENABLED'" })
      ).toThrow("Invalid filter field name");
    });

    it("should reject filter field names with uppercase", () => {
      expect(() =>
        buildListQuery("campaign", { "Campaign.Status": "= 'ENABLED'" })
      ).toThrow("Invalid filter field name");
    });

    it("should accept valid dotted filter field names", () => {
      const query = buildListQuery("campaign", {
        "campaign.status": "= 'ENABLED'",
      });
      expect(query).toContain("campaign.status = 'ENABLED'");
    });

    it("should reject orderBy field names with invalid characters", () => {
      expect(() =>
        buildListQuery("campaign", undefined, "campaign.name; DROP TABLE ASC")
      ).toThrow("Invalid orderBy field name");
    });

    it("should reject orderBy field names starting with uppercase", () => {
      expect(() =>
        buildListQuery("campaign", undefined, "Campaign.name ASC")
      ).toThrow("Invalid orderBy field name");
    });

    it("should accept valid orderBy with direction", () => {
      const query = buildListQuery("campaign", undefined, "campaign.name DESC");
      expect(query).toContain("ORDER BY campaign.name DESC");
    });
  });

  describe("buildGetByIdQuery", () => {
    it("should build a get-by-id query for campaign", () => {
      const query = buildGetByIdQuery("campaign", "123456");
      expect(query).toContain("SELECT");
      expect(query).toContain("campaign.id");
      expect(query).toContain("FROM campaign");
      expect(query).toContain("WHERE campaign.id = 123456");
      expect(query).toContain("LIMIT 1");
    });

    it("should build a get-by-id query for adGroupCriterion", () => {
      const query = buildGetByIdQuery("adGroupCriterion", "789");
      expect(query).toContain("FROM ad_group_criterion");
      expect(query).toContain("WHERE ad_group_criterion.criterion_id = 789");
      expect(query).toContain("LIMIT 1");
    });

    it("should build a get-by-id query for biddingStrategy", () => {
      const query = buildGetByIdQuery("biddingStrategy", "999");
      expect(query).toContain("FROM bidding_strategy");
      expect(query).toContain("WHERE bidding_strategy.id = 999");
    });
  });
});

import { describe, it, expect } from "vitest";
import { buildListQuery, buildGetByIdQuery } from "../src/mcp-server/tools/utils/query-helpers.js";
import { getSupportedEntityTypes } from "../src/mcp-server/tools/utils/entity-mapping.js";
import { listEntitiesTool } from "../src/mcp-server/tools/definitions/list-entities.tool.js";
import { entitySchemaAllResource } from "../src/mcp-server/resources/definitions/entity-schemas.resource.js";
import {
  extractFromResource,
  extractQueryFields,
  isV0Field,
  isV0RowResource,
} from "./helpers/v0-field-catalog.js";

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
        "campaign.id": "= 456",
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
      expect(() => buildListQuery("campaign", { "1invalid": "= 'ENABLED'" })).toThrow(
        "Invalid filter field name"
      );
    });

    it("should reject filter field names with uppercase", () => {
      expect(() => buildListQuery("campaign", { "Campaign.Status": "= 'ENABLED'" })).toThrow(
        "Invalid filter field name"
      );
    });

    it("should accept valid dotted filter field names", () => {
      const query = buildListQuery("campaign", {
        "campaign.status": "= 'ENABLED'",
      });
      expect(query).toContain("campaign.status = 'ENABLED'");
    });

    it("should reject orderBy field names with invalid characters", () => {
      expect(() => buildListQuery("campaign", undefined, "campaign.name; DROP TABLE ASC")).toThrow(
        "Invalid orderBy field name"
      );
    });

    it("should reject orderBy field names starting with uppercase", () => {
      expect(() => buildListQuery("campaign", undefined, "Campaign.name ASC")).toThrow(
        "Invalid orderBy field name"
      );
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

  describe("Reporting API v0 schema conformance", () => {
    // The catalog helper must actually reject GAQL-only fields, or the
    // conformance checks below prove nothing.
    it("rejects fields that exist in Google Ads GAQL but not in SA360 v0", () => {
      expect(isV0Field("ad_group.campaign")).toBe(false);
      expect(isV0Field("ad_group_ad.ad_group")).toBe(false);
      expect(isV0Field("campaign_criterion.campaign")).toBe(false);
      expect(isV0Field("ad_group.id")).toBe(true);
      expect(isV0Field("ad_group_criterion.keyword.text")).toBe(true);
    });

    for (const entityType of getSupportedEntityTypes()) {
      it(`default list/get queries for ${entityType} only use v0 fields`, () => {
        for (const query of [buildListQuery(entityType), buildGetByIdQuery(entityType, "1")]) {
          const from = extractFromResource(query);
          expect(from && isV0RowResource(from), `FROM ${from}`).toBe(true);
          const invalid = extractQueryFields(query).filter((f) => !isV0Field(f));
          expect(invalid, query).toEqual([]);
        }
      });
    }

    it("selects the parent ID for child entities so they can be filtered by parent", () => {
      expect(buildListQuery("adGroup")).toContain("campaign.id");
      expect(buildListQuery("adGroupAd")).toContain("ad_group.id");
      expect(buildListQuery("campaignCriterion")).toContain("campaign.id");
    });

    it("entity-schema resources only document v0 fields", async () => {
      const content = await entitySchemaAllResource.getContent();
      const documented = [...content.matchAll(/`([a-z_]+(?:\.[a-z_]+)+)`/g)].map((m) => m[1]);
      expect(documented.length).toBeGreaterThan(30);
      expect(documented.filter((f) => !isV0Field(f))).toEqual([]);
    });

    it("list_entities input examples only filter/order on v0 fields", () => {
      for (const example of listEntitiesTool.inputExamples) {
        const input = example.input as {
          entityType: Parameters<typeof buildListQuery>[0];
          filters?: Record<string, string>;
          orderBy?: string;
        };
        const query = buildListQuery(input.entityType, input.filters, input.orderBy);
        const invalid = extractQueryFields(query).filter((f) => !isV0Field(f));
        expect(invalid, `${example.label}: ${query}`).toEqual([]);
      }
    });
  });
});

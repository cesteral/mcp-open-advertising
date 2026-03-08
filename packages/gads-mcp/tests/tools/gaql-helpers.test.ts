import { describe, it, expect } from "vitest";
import { buildListQuery, buildGetByIdQuery } from "../../src/mcp-server/tools/utils/gaql-helpers.js";

describe("buildListQuery", () => {
  it("builds basic SELECT query without filters", () => {
    const query = buildListQuery("campaign");
    expect(query).toContain("SELECT");
    expect(query).toContain("FROM campaign");
    expect(query).not.toContain("WHERE");
    expect(query).not.toContain("LIMIT");
  });

  it("does not include LIMIT clause (pagination via API body params)", () => {
    const query = buildListQuery("campaign");
    expect(query).not.toContain("LIMIT");
  });

  it("includes WHERE clause for filters", () => {
    const query = buildListQuery("campaign", { "campaign.status": "= 'ENABLED'" });
    expect(query).toContain("WHERE campaign.status = 'ENABLED'");
  });

  it("includes ORDER BY clause", () => {
    const query = buildListQuery("campaign", undefined, "campaign.name ASC");
    expect(query).toContain("ORDER BY campaign.name ASC");
  });

  it("supports operator prefixes in filter values", () => {
    const query = buildListQuery("campaign", {
      "campaign.status": "IN ('ENABLED', 'PAUSED')",
    });
    expect(query).toContain("WHERE campaign.status IN ('ENABLED', 'PAUSED')");
  });

  it("wraps bare filter values in quotes", () => {
    const query = buildListQuery("campaign", { "campaign.name": "Test Campaign" });
    expect(query).toContain("WHERE campaign.name = 'Test Campaign'");
  });

  it("escapes single quotes in filter values", () => {
    const query = buildListQuery("campaign", { "campaign.name": "O'Brien's Campaign" });
    expect(query).toContain("WHERE campaign.name = 'O\\'Brien\\'s Campaign'");
  });

  it("escapes backslashes before escaping single quotes in filter values", () => {
    const query = buildListQuery("campaign", { "campaign.name": "Path\\O'Brien" });
    expect(query).toContain("WHERE campaign.name = 'Path\\\\O\\'Brien'");
  });

  it("combines multiple filters with AND", () => {
    const query = buildListQuery("campaign", {
      "campaign.status": "= 'ENABLED'",
      "campaign.name": "Test",
    });
    expect(query).toContain("WHERE");
    expect(query).toContain("AND");
  });

  it("includes correct fields for adGroup", () => {
    const query = buildListQuery("adGroup");
    expect(query).toContain("FROM ad_group");
    expect(query).toContain("ad_group.id");
    expect(query).toContain("ad_group.name");
  });
});

describe("buildGetByIdQuery", () => {
  it("builds query with ID filter and LIMIT 1", () => {
    const query = buildGetByIdQuery("campaign", "12345");
    expect(query).toContain("FROM campaign");
    expect(query).toContain("WHERE campaign.id = 12345");
    expect(query).toContain("LIMIT 1");
  });

  it("uses correct id field for keyword", () => {
    const query = buildGetByIdQuery("keyword", "67890");
    expect(query).toContain("FROM ad_group_criterion");
    expect(query).toContain("WHERE ad_group_criterion.criterion_id = 67890");
  });
});

import { describe, expect, it } from "vitest";

import {
  entityHierarchyResource,
  entitySchemaAllResource,
  reportingReferenceResource,
} from "../../src/mcp-server/resources/definitions/index.js";

describe("Amazon DSP resource contract", () => {
  it("entity schema resource includes target and creativeAssociation coverage", () => {
    const content = entitySchemaAllResource.getContent();

    expect(content).toContain("Canonical MCP type: `target`");
    expect(content).toContain("Canonical MCP type: `creativeAssociation`");
  });

  it("entity hierarchy reflects the expanded management surface", () => {
    const content = entityHierarchyResource.getContent();

    expect(content).toContain("Campaign / Order");
    expect(content).toContain("Ad Group / Line Item");
    expect(content).toContain("Creative Association");
    expect(content).toContain("/dsp/targets");
    // Reporting is DSP reports v3, not the Sponsored Ads /reporting/reports API.
    expect(content).toContain("/accounts/{accountId}/dsp/reports");
    expect(content).not.toContain("/reporting/reports");
  });

  it("reporting reference documents the account-scoped DSP reports v3 contract (Amazon Postman)", () => {
    const content = reportingReferenceResource.getContent();

    expect(content).toContain("POST /accounts/{accountId}/dsp/reports");
    expect(content).toContain("GET /accounts/{accountId}/dsp/reports/{reportId}");
    expect(content).toContain("application/vnd.dspcreatereports.v3+json");
    expect(content).toContain("application/vnd.dspgetreports.v3+json");
    expect(content).toContain('"startDate": "2026-03-01"');
    expect(content).toContain('"metrics": ["impressions", "totalCost"]');
    expect(content).not.toMatch(/"startDate": "\d{8}"/);
    expect(content).toContain("application/json");
    expect(content).toContain("IN_PROGRESS, SUCCESS, FAILURE");
    expect(content).toContain("CAMPAIGN");
  });
});

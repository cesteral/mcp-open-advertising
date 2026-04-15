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
    expect(content).toContain("Accepted aliases: campaign");
    expect(content).toContain("Accepted aliases: adGroup");
  });

  it("entity hierarchy reflects the expanded management surface", () => {
    const content = entityHierarchyResource.getContent();

    expect(content).toContain("Campaign / Order");
    expect(content).toContain("Ad Group / Line Item");
    expect(content).toContain("Creative Association");
    expect(content).toContain("/dsp/targets");
  });

  it("reporting reference documents reporting v3", () => {
    const content = reportingReferenceResource.getContent();

    expect(content).toContain("POST /accounts/{accountId}/dsp/reports");
    expect(content).toContain("GET /accounts/{accountId}/dsp/reports/{reportId}");
    expect(content).toContain("application/vnd.dspcreatereports.v3+json");
    expect(content).toContain("application/vnd.dspgetreports.v3+json");
    expect(content).toContain("PENDING, PROCESSING, COMPLETED, FAILED");
  });
});

import { describe, expect, it } from "vitest";
import { analyticsReferenceResource } from "../../src/mcp-server/resources/definitions/analytics-reference.resource.js";
import { getLinkedInAnalyticsReportingWorkflowMessage } from "../../src/mcp-server/prompts/definitions/analytics-reporting-workflow.prompt.js";
import { getLinkedInCampaignSetupWorkflowMessage } from "../../src/mcp-server/prompts/definitions/campaign-setup-workflow.prompt.js";
import { getLinkedInTroubleshootEntityMessage } from "../../src/mcp-server/prompts/definitions/troubleshoot-entity.prompt.js";
import {
  LINKEDIN_ANALYTICS_PIVOTS,
  resolveAnalyticsFields,
} from "../../src/services/linkedin/analytics-fields.js";

// The analytics reference and the prompts teach a model which metrics and pivots
// to ask for. They taught names LinkedIn does not have (`conversions`, `reach`,
// `frequency`, `MEMBER_COUNTRY`, ...), and nothing checked them against the tools'
// own validation. These tests do.

const resource = analyticsReferenceResource.getContent() as string;

const prompts: Array<[string, string]> = [
  [
    "analytics-reporting-workflow",
    getLinkedInAnalyticsReportingWorkflowMessage({ adAccountUrn: "urn:li:sponsoredAccount:1" }),
  ],
  ["campaign-setup-workflow", getLinkedInCampaignSetupWorkflowMessage({})],
  ["troubleshoot-entity", getLinkedInTroubleshootEntityMessage({})],
];

/** First-column names of the table rows under `heading` (up to the next `## `). */
function tableNames(markdown: string, heading: string): string[] {
  const start = markdown.indexOf(heading);
  expect(start, `${heading} section`).toBeGreaterThanOrEqual(0);
  const rest = markdown.slice(start + heading.length);
  const section = rest.slice(0, rest.search(/\n## /) === -1 ? undefined : rest.search(/\n## /));
  return [...section.matchAll(/^\|\s*([A-Za-z_]+)\s*\|/gm)]
    .map((m) => m[1]!)
    .filter((n) => n !== "Metric" && n !== "Pivot");
}

describe("analytics reference resource", () => {
  it("lists only metrics the tools accept", () => {
    const metrics = tableNames(resource, "## Available Metrics");
    expect(metrics.length).toBeGreaterThan(15);
    for (const metric of metrics) {
      expect(() => resolveAnalyticsFields([metric]), metric).not.toThrow();
    }
  });

  it("lists only pivots the tools accept", () => {
    const pivots = tableNames(resource, "## Available Pivots");
    expect(pivots.length).toBeGreaterThan(10);
    for (const pivot of pivots) {
      expect(LINKEDIN_ANALYTICS_PIVOTS as readonly string[], pivot).toContain(pivot);
    }
  });

  it("names the geo pivots as LinkedIn does, and says which are not accepted", () => {
    expect(resource).toContain("MEMBER_COUNTRY_V2");
    expect(resource).toContain("MEMBER_REGION_V2");
    expect(tableNames(resource, "## Available Pivots")).not.toContain("MEMBER_COUNTRY");
    expect(tableNames(resource, "## Available Pivots")).not.toContain("MEMBER_REGION");
  });

  it("does not invent a paging.total, and says the endpoint is not paginated", () => {
    expect(resource).not.toMatch(/"total"\s*:/);
    expect(resource).toMatch(/not paginated/i);
    expect(resource).toContain("15,000");
  });

  it("gives an example whose fields attribute each row", () => {
    expect(resource).toMatch(/fields=[^\n]*dateRange,pivotValues/);
  });
});

describe.each(prompts)("%s prompt", (_name, text) => {
  it("only requests metrics the tools accept", () => {
    const arrays = [...text.matchAll(/"metrics":\s*\[([^\]]*)\]/g)];
    for (const [, body] of arrays) {
      for (const name of [...body!.matchAll(/"([A-Za-z]+)"/g)].map((m) => m[1]!)) {
        expect(() => resolveAnalyticsFields([name]), name).not.toThrow();
      }
    }
  });

  it("does not use a pivot LinkedIn does not have", () => {
    for (const bad of ["MEMBER_GEO_COUNTRY", "`MEMBER_COUNTRY`", "`MEMBER_REGION`"]) {
      expect(text, bad).not.toContain(bad);
    }
  });

  it("does not pass analytics parameters the tool does not have", () => {
    // linkedin_get_analytics takes no `campaigns` filter.
    expect(text).not.toMatch(/linkedin_get_analytics\(\{[^}]*"campaigns"/s);
  });
});

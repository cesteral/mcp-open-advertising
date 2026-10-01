import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: vi.fn(),
}));

import { allResources } from "../../src/mcp-server/resources/definitions/index.js";
import { allTools } from "../../src/mcp-server/tools/definitions/index.js";
import { promptRegistry } from "../../src/mcp-server/prompts/index.js";
import { targetingReferenceResource } from "../../src/mcp-server/resources/definitions/targeting-reference.resource.js";
import {
  RETIRED_FACET_NAMES,
  RETIRED_VALUE_NAMESPACES,
  TARGETING_FACETS,
  findTargetingCriteriaProblems,
} from "../../src/services/linkedin/targeting-facets.js";

// The resources, prompts and tool examples teach a model which facets and value
// URNs to put in targetingCriteria. They taught facets LinkedIn does not have
// (`adTargetingFacet:geos`, `memberSeniorities`, `companySizes`, `organizations`),
// value URNs in a namespace LinkedIn does not have (`urn:li:adSeniority:5`), and
// `facetType` values (`MEMBER_SKILLS`, `GEO`) that are not LinkedIn identifiers.
// Facet names and value namespaces are from the Targeting Criteria Facet URNs
// page, read 2026-10-01.

const sources: Array<[string, string]> = [
  ...allResources.map((r): [string, string] => [`resource ${r.uri}`, r.getContent()]),
  ...[...promptRegistry.entries()]
    // The two cross-platform prompts come from @cesteral/shared and name no LinkedIn facet.
    .filter(([name]) => !name.startsWith("cross_platform_"))
    .map(([name, def]): [string, string] => [
      `prompt ${name}`,
      def.generateMessage({
        adAccountUrn: "urn:li:sponsoredAccount:1",
        entityType: "campaign",
        entityUrn: "urn:li:sponsoredCampaign:1",
        goal: "build",
      }),
    ]),
  ...allTools
    .filter((t) => t.name.startsWith("linkedin_"))
    .map((t): [string, string] => [
      `tool ${t.name}`,
      `${t.description}\n${JSON.stringify(t.inputExamples ?? [])}`,
    ]),
];

describe("targeting text in resources, prompts and tool examples", () => {
  it("scans something", () => {
    expect(sources.length).toBeGreaterThan(20);
  });

  describe.each(sources)("%s", (_name, text) => {
    it("names no facet or value namespace LinkedIn has retired", () => {
      for (const retired of Object.keys(RETIRED_FACET_NAMES)) {
        expect(text, `adTargetingFacet:${retired}`).not.toMatch(
          new RegExp(`adTargetingFacet:${retired}\\b`)
        );
      }
      for (const namespace of Object.keys(RETIRED_VALUE_NAMESPACES)) {
        expect(text, `urn:li:${namespace}:`).not.toContain(`urn:li:${namespace}:`);
      }
      // Bare spellings the prompts used for the same facets.
      expect(text).not.toMatch(/\bmemberSeniorities\b|\bcompanySizes\b/);
    });

    it("does not use the made-up facetType identifiers", () => {
      expect(text).not.toContain("facetType");
      for (const bad of [
        "MEMBER_SKILLS",
        "MEMBER_INTERESTS",
        "MEMBER_DEGREE",
        "MEMBER_FIELD_OF_STUDY",
        "MEMBER_SCHOOL",
        "MEMBER_JOB_TITLE_FACET",
      ]) {
        expect(text, bad).not.toContain(bad);
      }
      expect(text).not.toMatch(/\bGEOS?\b/);
    });

    it("only names facets in LinkedIn's documented table", () => {
      const documented = new Set(Object.keys(TARGETING_FACETS));
      for (const [, name] of text.matchAll(/urn:li:adTargetingFacet:([A-Za-z]+)/g)) {
        expect(documented.has(name!), `${name} is not a documented facet`).toBe(true);
      }
    });
  });

  it("has every targetingCriteria example in a JSON block pass the criteria validator", () => {
    let checked = 0;
    const visit = (value: unknown, where: string): void => {
      if (Array.isArray(value)) value.forEach((v) => visit(v, where));
      else if (value && typeof value === "object") {
        for (const [key, inner] of Object.entries(value)) {
          if (key === "targetingCriteria" && inner && typeof inner === "object") {
            checked += 1;
            expect(findTargetingCriteriaProblems(inner), where).toEqual([]);
          } else visit(inner, where);
        }
      }
    };
    for (const [name, text] of sources) {
      for (const [, block] of text.matchAll(/```json\n([\s\S]*?)```/g)) {
        try {
          visit(JSON.parse(block!), name);
        } catch {
          /* a block with placeholders is not a complete example */
        }
      }
      try {
        visit(JSON.parse(text), name);
      } catch {
        /* not JSON */
      }
    }
    expect(checked).toBeGreaterThanOrEqual(4);
  });

  it("has every targeting tool call in a prompt validate against the tool's own schema", () => {
    const targetingTools = new Map(
      allTools
        .filter((t) =>
          [
            "linkedin_search_targeting",
            "linkedin_get_targeting_options",
            "linkedin_get_delivery_forecast",
            "linkedin_get_audience_count",
            "linkedin_get_ad_preview",
          ].includes(t.name)
        )
        .map((t) => [t.name, t.inputSchema])
    );
    const seen = new Set<string>();
    for (const [name, text] of sources.filter(([n]) => n.startsWith("prompt "))) {
      for (const [, block] of text.matchAll(/```json\n([\s\S]*?)```/g)) {
        let parsed: { tool?: string; params?: unknown };
        try {
          parsed = JSON.parse(block!);
        } catch {
          continue;
        }
        const schema = parsed.tool ? targetingTools.get(parsed.tool) : undefined;
        if (!schema) continue;
        const result = schema.safeParse(parsed.params);
        expect(
          result.success,
          `${name}: ${parsed.tool} ${JSON.stringify(result.error?.issues)}`
        ).toBe(true);
        seen.add(parsed.tool!);
      }
    }
    expect([...seen].sort()).toEqual([
      "linkedin_get_ad_preview",
      "linkedin_get_audience_count",
      "linkedin_get_delivery_forecast",
      "linkedin_get_targeting_options",
      "linkedin_search_targeting",
    ]);
  });

  it("gives linkedin_get_ad_preview its account wherever a prompt shows a call", () => {
    for (const [name, text] of sources.filter(([n]) => n.startsWith("prompt "))) {
      for (const [call] of text.matchAll(/linkedin_get_ad_preview\([^)]*\)/g)) {
        expect(call, name).toContain("adAccountUrn");
        expect(call, name).not.toContain("adFormat");
      }
    }
  });
});

describe("targeting reference resource", () => {
  const text = targetingReferenceResource.getContent();

  it("labels only the seniority ids LinkedIn's pages document", () => {
    // Ad Targeting page: 1 Unpaid, 4 Senior, 9 Partner, 10 Owner (and 2 Training,
    // 3 Entry in the sample). The pages do not settle 5-8, so none is labelled.
    const documented: Record<string, string> = {
      "1": "Unpaid",
      "2": "Training",
      "3": "Entry",
      "4": "Senior",
      "9": "Partner",
      "10": "Owner",
    };
    const rows = [...text.matchAll(/^\|\s*`urn:li:seniority:(\d+)`\s*\|\s*([^|\n]+?)\s*\|/gm)];
    expect(rows.length).toBeGreaterThan(0);
    for (const [, id, label] of rows) {
      expect(documented[id!], `urn:li:seniority:${id}`).toBe(label);
    }
  });

  it("says locations are searched, not browsed", () => {
    expect(text).toMatch(/locations[^\n]*(typeahead|search)/i);
  });

  it("says locations and profileLocations are alternatives", () => {
    expect(text).toMatch(
      /locations.*profileLocations.*not both|either.*locations.*or.*profileLocations/is
    );
  });

  it("names the five targeting tools", () => {
    for (const tool of [
      "linkedin_get_targeting_options",
      "linkedin_search_targeting",
      "linkedin_get_audience_count",
      "linkedin_get_delivery_forecast",
    ]) {
      expect(text).toContain(tool);
    }
  });
});

import { describe, expect, it } from "vitest";
import {
  FACETS_INCLUDE_ONLY,
  RETIRED_FACET_NAMES,
  RETIRED_VALUE_NAMESPACES,
  TARGETING_FACETS,
  findTargetingCriteriaProblems,
  supportedFinders,
  toFacetUrn,
} from "../../src/services/linkedin/targeting-facets.js";

// Every expectation is from LinkedIn's pages, read 2026-10-01:
//  - Ad Targeting (integrations/ads/advertising-targeting/ads-targeting): the facet
//    descriptors and the "Discovering Targeting Entities" finder table.
//  - Targeting Criteria Facet URNs (shared/references/v2/ads/targeting-criteria-facet-urns):
//    the facet names, their value types, and the include-only rule.

describe("toFacetUrn", () => {
  it("prefixes a bare facet name", () => {
    expect(toFacetUrn("seniorities")).toBe("urn:li:adTargetingFacet:seniorities");
  });

  it("leaves a full facet URN alone", () => {
    expect(toFacetUrn("urn:li:adTargetingFacet:locations")).toBe(
      "urn:li:adTargetingFacet:locations"
    );
  });

  it("refuses a facet name LinkedIn retired, and says what replaces it", () => {
    for (const [retired, current] of Object.entries(RETIRED_FACET_NAMES)) {
      expect(() => toFacetUrn(retired), retired).toThrow(new RegExp(current));
      expect(() => toFacetUrn(`urn:li:adTargetingFacet:${retired}`), retired).toThrow(
        new RegExp(current)
      );
    }
  });

  it("refuses the made-up MEMBER_* / GEO facet types the tools used to advertise", () => {
    for (const bad of ["MEMBER_SKILLS", "MEMBER_SENIORITY", "GEO", "MEMBER_INDUSTRY"]) {
      expect(() => toFacetUrn(bad), bad).toThrow(/not a LinkedIn facet|facet name/i);
    }
  });
});

describe("the facet table", () => {
  it("names the four facets the code got wrong by their documented names", () => {
    expect(RETIRED_FACET_NAMES).toMatchObject({
      geos: "locations",
      memberSeniorities: "seniorities",
      companySizes: "staffCountRanges",
      organizations: "employers",
    });
    for (const current of ["locations", "seniorities", "staffCountRanges", "employers"]) {
      expect(Object.keys(TARGETING_FACETS)).toContain(current);
    }
  });

  it("records locations, profileLocations and schools as typeahead-only", () => {
    expect(supportedFinders("locations")).toEqual(["typeahead"]);
    expect(supportedFinders("profileLocations")).toEqual(["typeahead"]);
    expect(supportedFinders("schools")).toEqual(["typeahead"]);
  });

  it("records seniorities, genders and ageRanges as browse-only", () => {
    expect(supportedFinders("seniorities")).toEqual(["adTargetingFacet"]);
    expect(supportedFinders("genders")).toEqual(["adTargetingFacet"]);
    expect(supportedFinders("ageRanges")).toEqual(["adTargetingFacet"]);
  });

  it("records the three-finder facets", () => {
    expect(supportedFinders("industries")).toEqual([
      "adTargetingFacet",
      "typeahead",
      "similarEntities",
    ]);
  });

  it("has no entity discovery for the two audience-segment facets", () => {
    expect(supportedFinders("audienceMatchingSegments")).toEqual([]);
    expect(supportedFinders("dynamicSegments")).toEqual([]);
  });

  it("does not know a facet it was never told about, so a new LinkedIn facet is not refused", () => {
    expect(supportedFinders("someFutureFacet")).toBeUndefined();
  });

  it("lists the include-only facets", () => {
    expect([...FACETS_INCLUDE_ONLY].sort()).toEqual(
      ["ageRanges", "genders", "groups", "interfaceLocales"].sort()
    );
  });

  it("retires the made-up value namespaces", () => {
    expect(RETIRED_VALUE_NAMESPACES).toMatchObject({
      adSeniority: "seniority",
      adFieldOfStudy: "fieldOfStudy",
      adIndustry: "industry",
      adFunction: "function",
    });
  });
});

const geo = { "urn:li:adTargetingFacet:locations": ["urn:li:geo:103644278"] };

describe("findTargetingCriteriaProblems", () => {
  it("accepts the documented shape", () => {
    expect(
      findTargetingCriteriaProblems({
        include: { and: [{ or: geo }] },
        exclude: {
          or: { "urn:li:adTargetingFacet:staffCountRanges": ["urn:li:staffCountRange:(1,1)"] },
        },
      })
    ).toEqual([]);
  });

  it("requires include.and", () => {
    expect(findTargetingCriteriaProblems({})).toEqual([expect.stringMatching(/include\.and/)]);
    expect(findTargetingCriteriaProblems({ include: { or: geo } })).toEqual([
      expect.stringMatching(/include\.and/),
    ]);
  });

  it("requires each include.and entry to be { or: { facetUrn: [values] } }", () => {
    expect(findTargetingCriteriaProblems({ include: { and: [geo] } })).toEqual([
      expect.stringMatching(/include\.and\[0\]/),
    ]);
    expect(
      findTargetingCriteriaProblems({
        include: { and: [{ or: { "urn:li:adTargetingFacet:locations": "urn:li:geo:1" } }] },
      })
    ).toEqual([expect.stringMatching(/array/)]);
  });

  it("flags a retired facet name with the one to use instead", () => {
    const problems = findTargetingCriteriaProblems({
      include: { and: [{ or: { "urn:li:adTargetingFacet:geos": ["urn:li:geo:1"] } }] },
    });
    expect(problems).toEqual([expect.stringMatching(/geos.*locations/)]);
  });

  it("flags a retired value namespace with the one to use instead", () => {
    const problems = findTargetingCriteriaProblems({
      include: {
        and: [{ or: { "urn:li:adTargetingFacet:seniorities": ["urn:li:adSeniority:5"] } }],
      },
    });
    expect(problems).toEqual([expect.stringMatching(/adSeniority.*urn:li:seniority/)]);
  });

  it("flags an include-only facet used in exclude", () => {
    const problems = findTargetingCriteriaProblems({
      include: { and: [{ or: geo }] },
      exclude: { or: { "urn:li:adTargetingFacet:genders": ["urn:li:gender:MALE"] } },
    });
    expect(problems).toEqual([expect.stringMatching(/genders.*include/)]);
  });

  it("flags a key that is not a facet URN", () => {
    expect(
      findTargetingCriteriaProblems({ include: { and: [{ or: { geos: ["urn:li:geo:1"] } }] } })
    ).toEqual([expect.stringMatching(/urn:li:adTargetingFacet:/)]);
  });

  it("does not refuse a facet it has never heard of", () => {
    expect(
      findTargetingCriteriaProblems({
        include: { and: [{ or: { "urn:li:adTargetingFacet:someFutureFacet": ["urn:li:x:1"] } }] },
      })
    ).toEqual([]);
  });
});

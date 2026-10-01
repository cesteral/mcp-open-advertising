// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * LinkedIn ad-targeting facets and the `targetingCriteria` shape.
 *
 * Everything here is from LinkedIn's own pages, read 2026-10-01:
 *
 * - Ad Targeting — integrations/ads/advertising-targeting/ads-targeting: the
 *   "Discovering Targeting Entities" table (which finders each facet supports),
 *   and the finders themselves.
 * - Targeting Criteria Facet URNs — shared/references/v2/ads/targeting-criteria-facet-urns:
 *   the facet names, their value types, and which facets are include-only.
 * - Create and Manage Campaigns — the `targetingCriteria` JSON shape.
 *
 * Facet URNs are `urn:li:adTargetingFacet:<camelCasePluralName>`. The code used to
 * send `geos`, `memberSeniorities`, `companySizes` and `organizations`, which are
 * not facets, and value URNs in an `ad…` namespace (`urn:li:adSeniority:5`) that
 * LinkedIn does not have. Those are kept below only so they can be refused with
 * the name to use instead.
 */

import { JsonRpcErrorCode, McpError } from "@cesteral/shared";

export const FACET_URN_PREFIX = "urn:li:adTargetingFacet:";

/** The finders on `/rest/adTargetingEntities` that take a facet. */
export type TargetingFinder = "adTargetingFacet" | "typeahead" | "similarEntities";

const BROWSE: TargetingFinder = "adTargetingFacet";
const SEARCH: TargetingFinder = "typeahead";
const SIMILAR: TargetingFinder = "similarEntities";

/**
 * Facet name → the finders LinkedIn lists as supported for it. An empty list
 * means LinkedIn offers no entity discovery for the facet (audience segments are
 * discovered through the audience APIs).
 *
 * `locations` and `profileLocations` read "typeahead only after Bing Geo
 * Migration"; the pages do not say whether that migration has finished, so
 * browsing them is refused on the strength of the page, not a live call.
 */
export const TARGETING_FACETS: Readonly<Record<string, readonly TargetingFinder[]>> = {
  ageRanges: [BROWSE],
  audienceMatchingSegments: [],
  buyerGroups: [BROWSE, SEARCH],
  companyCategory: [BROWSE, SEARCH],
  degrees: [BROWSE, SEARCH],
  dynamicSegments: [],
  employers: [SEARCH, SIMILAR],
  employersAll: [SEARCH, SIMILAR],
  employersPast: [SEARCH, SIMILAR],
  fieldsOfStudy: [BROWSE, SEARCH],
  firstDegreeConnectionCompanies: [SEARCH, SIMILAR],
  followedCompanies: [SEARCH, SIMILAR],
  genders: [BROWSE],
  groups: [SEARCH, SIMILAR],
  growthRate: [BROWSE, SEARCH],
  industries: [BROWSE, SEARCH, SIMILAR],
  interests: [BROWSE, SEARCH],
  interfaceLocales: [BROWSE],
  jobFunctions: [BROWSE],
  locations: [SEARCH],
  memberBehaviors: [BROWSE, SEARCH],
  profileLocations: [SEARCH],
  revenue: [BROWSE, SEARCH],
  schools: [SEARCH],
  seniorities: [BROWSE],
  skills: [BROWSE, SEARCH, SIMILAR],
  staffCountRanges: [BROWSE],
  titles: [BROWSE, SEARCH, SIMILAR],
  titlesAll: [BROWSE, SEARCH, SIMILAR],
  titlesPast: [BROWSE, SEARCH, SIMILAR],
  yearsOfExperienceRanges: [BROWSE],
};

/** The finders LinkedIn lists for a facet, or `undefined` for one this table has not heard of. */
export function supportedFinders(facetName: string): readonly TargetingFinder[] | undefined {
  return Object.hasOwn(TARGETING_FACETS, facetName) ? TARGETING_FACETS[facetName] : undefined;
}

/** "The following facets can only be used in the include clause of targetingCriteria." */
export const FACETS_INCLUDE_ONLY: readonly string[] = [
  "ageRanges",
  "genders",
  "groups",
  "interfaceLocales",
];

/** Facet names the code used that are not LinkedIn's, and the facet each was meant to be. */
export const RETIRED_FACET_NAMES: Readonly<Record<string, string>> = {
  geos: "locations",
  memberSeniorities: "seniorities",
  companySizes: "staffCountRanges",
  organizations: "employers",
};

/** Value-URN namespaces the code used that are not LinkedIn's, and the one each was meant to be. */
export const RETIRED_VALUE_NAMESPACES: Readonly<Record<string, string>> = {
  adSeniority: "seniority",
  adFunction: "function",
  adIndustry: "industry",
  adCompanySize: "staffCountRange",
  adTitle: "title",
  adInterest: "interest",
  adDegree: "degree",
  adFieldOfStudy: "fieldOfStudy",
  adSchool: "organization",
};

const FACET_NAME = /^[a-z][A-Za-z]*$/;

function invalid(message: string): McpError {
  return new McpError(JsonRpcErrorCode.InvalidParams, message);
}

function retiredFacetMessage(name: string): string | undefined {
  const current = Object.hasOwn(RETIRED_FACET_NAMES, name) ? RETIRED_FACET_NAMES[name] : undefined;
  return current
    ? `"${name}" is not a LinkedIn targeting facet; the facet is "${current}" (${FACET_URN_PREFIX}${current}).`
    : undefined;
}

/**
 * A facet URN from a bare name (`seniorities`) or a full URN. Refuses the names
 * the code used to teach, with the one to use instead.
 */
export function toFacetUrn(facet: string): string {
  const name = facet.startsWith(FACET_URN_PREFIX) ? facet.slice(FACET_URN_PREFIX.length) : facet;
  const retired = retiredFacetMessage(name);
  if (retired) throw invalid(retired);
  if (!FACET_NAME.test(name)) {
    throw invalid(
      `"${facet}" is not a LinkedIn facet name. Facet names are camelCase (e.g. "industries", ` +
        `"seniorities"); list them with linkedin_get_targeting_options.`
    );
  }
  return `${FACET_URN_PREFIX}${name}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function orClauseProblems(where: string, clause: unknown, side: "include" | "exclude"): string[] {
  if (!isRecord(clause) || !isRecord(clause.or)) {
    return [`${where} must be { "or": { "<facet URN>": ["<value URN>", ...] } }.`];
  }
  const problems: string[] = [];
  for (const [key, values] of Object.entries(clause.or)) {
    if (!key.startsWith(FACET_URN_PREFIX)) {
      problems.push(
        `${where}.or key "${key}" must be a facet URN starting with ${FACET_URN_PREFIX} ` +
          `(e.g. ${FACET_URN_PREFIX}locations).`
      );
      continue;
    }
    const name = key.slice(FACET_URN_PREFIX.length);
    const retired = retiredFacetMessage(name);
    if (retired) {
      problems.push(retired);
      continue;
    }
    if (side === "exclude" && FACETS_INCLUDE_ONLY.includes(name)) {
      problems.push(`The ${name} facet can only be used in include, not exclude.`);
    }
    if (!Array.isArray(values)) {
      problems.push(`${where}.or["${key}"] must be an array of value URNs.`);
      continue;
    }
    for (const value of values) {
      if (typeof value !== "string") continue;
      const namespace = /^urn:li:([A-Za-z]+):/.exec(value)?.[1];
      if (namespace && Object.hasOwn(RETIRED_VALUE_NAMESPACES, namespace)) {
        problems.push(
          `"${value}" uses the namespace ${namespace}, which LinkedIn does not have; ` +
            `use urn:li:${RETIRED_VALUE_NAMESPACES[namespace]}:<id>.`
        );
      }
    }
  }
  return problems;
}

/**
 * What is wrong with a `targetingCriteria` object, as one message per problem.
 * Empty when it is the documented shape —
 * `{ include: { and: [{ or: { facetUrn: [values] } }] }, exclude?: { or: { facetUrn: [values] } } }`
 * — with no retired facet or value namespace and no include-only facet in exclude.
 * A facet this module has never heard of is not a problem.
 */
export function findTargetingCriteriaProblems(criteria: unknown): string[] {
  if (!isRecord(criteria)) return ["targetingCriteria must be an object."];
  const problems: string[] = [];

  const include = criteria.include;
  if (!isRecord(include) || !Array.isArray(include.and)) {
    problems.push(
      `targetingCriteria.include.and must be an array of { "or": { "<facet URN>": [...] } } clauses.`
    );
  } else {
    include.and.forEach((clause, index) => {
      problems.push(...orClauseProblems(`include.and[${index}]`, clause, "include"));
    });
  }

  if (criteria.exclude !== undefined) {
    problems.push(...orClauseProblems("exclude", criteria.exclude, "exclude"));
  }
  return problems;
}

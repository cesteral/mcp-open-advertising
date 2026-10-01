// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { findTargetingCriteriaProblems } from "../../../services/linkedin/targeting-facets.js";

const OrClauseSchema = z.object({
  or: z
    .record(z.array(z.string()))
    .describe(
      'Facet URN → value URNs, e.g. { "urn:li:adTargetingFacet:locations": ["urn:li:geo:103644278"] }. Any one value matches.'
    ),
});

/**
 * LinkedIn `targetingCriteria`: `include.and` is a list of `or` clauses that must
 * all match; `exclude.or` removes members matching any value. Facet URNs are
 * `urn:li:adTargetingFacet:<name>` — find names with `linkedin_get_targeting_options`
 * and values with `linkedin_search_targeting`.
 *
 * The facet and value checks refuse the names the tools used to teach
 * (`adTargetingFacet:geos`, `urn:li:adSeniority:5`, …) with the one to use
 * instead, rather than leaving LinkedIn to answer with a 400.
 */
export const TargetingCriteriaSchema = z
  .object({
    include: z.object({
      and: z.array(OrClauseSchema).describe("Clauses that must ALL match (AND between facets)."),
    }),
    exclude: OrClauseSchema.optional().describe(
      "Members matching ANY of these are excluded. ageRanges, genders, groups and interfaceLocales are include-only."
    ),
  })
  .superRefine((criteria, ctx) => {
    for (const message of findTargetingCriteriaProblems(criteria)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    }
  })
  .describe("LinkedIn targetingCriteria object");

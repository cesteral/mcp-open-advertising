// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Fixed Microsoft Advertising v13 targeting enum values handed to callers for
 * use in `msads_manage_criterions` payloads. Single source for
 * `msads_search_targeting` and `msads_get_targeting_options`.
 */

/**
 * AgeRange (`campaign-management-service/agerange.md` xs:enumeration). Note the
 * API's own spelling `ThirtyFiveToFourtyNine` — `ThirtyFiveToFortyNine` is not
 * a valid value.
 */
export const MSADS_AGE_RANGES: ReadonlyArray<{ Id: string; Name: string }> = [
  { Id: "EighteenToTwentyFour", Name: "18-24" },
  { Id: "TwentyFiveToThirtyFour", Name: "25-34" },
  { Id: "ThirtyFiveToFourtyNine", Name: "35-49" },
  { Id: "ThirtyFiveToFiftyFour", Name: "35-54" },
  { Id: "FiftyToSixtyFour", Name: "50-64" },
  { Id: "FiftyFiveAndAbove", Name: "55+" },
  { Id: "SixtyFiveAndAbove", Name: "65+" },
  { Id: "Unknown", Name: "Unknown age" },
];

/**
 * GenderType (`gendertype.md`). `Unknown` is "only available for ad groups in
 * Audience campaigns".
 */
export const MSADS_GENDERS: ReadonlyArray<{ Id: string; Name: string }> = [
  { Id: "Male", Name: "Male" },
  { Id: "Female", Name: "Female" },
  { Id: "Unknown", Name: "Unknown (Audience campaign ad groups only)" },
];

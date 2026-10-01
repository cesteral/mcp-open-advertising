// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";

/**
 * CM360 ids go into the request path (`/userprofiles/{profileId}/{collection}/{id}`).
 * dfareporting v5 Discovery (rev 20260721) types every `profileId` and `id`
 * path parameter as an int64 string, so only digits are accepted; anything
 * else is refused before it reaches the path (cm360 #19).
 */
const INT64_ID = /^\d+$/;

/** The `profileId` every cm360 tool takes. */
export const Cm360ProfileIdSchema = z
  .string()
  .regex(INT64_ID, "profileId must be a numeric CM360 user profile ID")
  .describe("CM360 User Profile ID");

/** A CM360 entity id (campaign, placement, ad, creative, site, advertiser, floodlight). */
export function cm360EntityIdSchema(description: string) {
  return z.string().regex(INT64_ID, "entity IDs must be numeric (int64)").describe(description);
}

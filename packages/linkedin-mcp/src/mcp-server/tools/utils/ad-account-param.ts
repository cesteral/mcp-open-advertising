// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { itemRequiresAdAccount, type LinkedInEntityType } from "./entity-mapping.js";

/**
 * The `adAccountUrn` parameter of the tools that address one existing entity
 * (get, update, delete, duplicate, the bulk updates, adjust_bids).
 *
 * LinkedIn's versioned item paths carry the owning ad account, and a LinkedIn
 * entity URN does not, so the caller names it (#210):
 *
 *   /rest/adAccounts/{id}/adCampaigns/{campaignId}
 *   /rest/adAccounts/{id}/adCampaignGroups/{groupId}
 *   /rest/adAccounts/{id}/creatives/{encoded creative URN}
 *   /rest/conversions/{conversionId}?account={account URN}
 *
 * Optional in the schema only because an `adAccount` is its own account; for
 * every other entity type `refineAdAccountUrn` makes it required.
 */
export const adAccountUrnSchema = z
  .string()
  .min(1)
  .optional()
  .describe(
    "The ad account that owns the entity (e.g. urn:li:sponsoredAccount:123). Required for every entity type except adAccount: LinkedIn addresses campaigns, campaign groups, creatives and conversion rules under their account."
  );

/** `superRefine` body: require `adAccountUrn` unless the entity is an ad account. */
export function refineAdAccountUrn(
  value: { entityType: string; adAccountUrn?: string },
  ctx: z.RefinementCtx
): void {
  if (value.adAccountUrn !== undefined) return;
  if (!itemRequiresAdAccount(value.entityType as LinkedInEntityType)) return;
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ["adAccountUrn"],
    message: `adAccountUrn is required for a ${value.entityType}: LinkedIn addresses it under its ad account.`,
  });
}

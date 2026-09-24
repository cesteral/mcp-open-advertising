// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Parent-ID inputs shared by the batch write tools (bulk create / bulk update /
 * bulk status).
 *
 * Microsoft Ads v13 Add / Update operations take the owning parent as a
 * request-body element next to the entity array — AccountId for campaigns and
 * ad extensions, CampaignId for ad groups, AdGroupId for ads and keywords
 * (`addcampaigns.md`, `addadgroups.md`, `addads.md`, `addkeywords.md`,
 * `addadextensions.md` and their `update*` counterparts). One call therefore
 * targets exactly one parent.
 */

import { z } from "zod";
import type { DryRunValidationError } from "@cesteral/shared";
import {
  getWriteParent,
  missingWriteParentMessage,
  type MsAdsEntityType,
} from "./entity-mapping.js";

export const parentIdInputFields = {
  accountId: z
    .string()
    .optional()
    .describe(
      "Required for campaign and adExtension: the account that owns them, sent as the request-body AccountId"
    ),
  campaignId: z
    .string()
    .optional()
    .describe(
      "Required for adGroup: the campaign that owns every ad group in this call, sent as the request-body CampaignId"
    ),
  adGroupId: z
    .string()
    .optional()
    .describe(
      "Required for ad and keyword: the ad group that owns every item in this call, sent as the request-body AdGroupId"
    ),
};

export interface ParentIdInput {
  entityType: string;
  accountId?: string;
  campaignId?: string;
  adGroupId?: string;
}

/** The parent ID value this entity type's write needs, if any. */
export function resolveParentId(input: ParentIdInput): string | undefined {
  const parent = getWriteParent(input.entityType as MsAdsEntityType);
  return parent ? input[parent.inputKey] : undefined;
}

/** A dry-run validation error when the required parent ID is missing, else none. */
export function validateParentId(input: ParentIdInput): DryRunValidationError[] {
  const message = missingWriteParentMessage(input.entityType as MsAdsEntityType, input);
  if (!message) return [];
  const parent = getWriteParent(input.entityType as MsAdsEntityType);
  return [{ code: "MISSING_PARENT_ID", message, field: parent?.inputKey ?? "parentId" }];
}

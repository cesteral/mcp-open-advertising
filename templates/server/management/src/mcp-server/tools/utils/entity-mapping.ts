// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * The entity types this server exposes, their API path segment and their
 * canonical governance kind.
 *
 * TODO(scaffold): use the platform's own names. A type with no canonical kind
 * (a creative, an audience) is still listable, but governed writes resolve it
 * to `canonicalEntityKind: null`.
 */

export const ENTITY_TYPES = ["campaign", "ad_group", "ad"] as const;
export type {{Pascal}}EntityType = (typeof ENTITY_TYPES)[number];

/** Path segment under `/accounts/{accountId}/` (placeholder; see the vendor docs). */
export const ENTITY_PATHS: Record<{{Pascal}}EntityType, string> = {
  campaign: "campaigns",
  ad_group: "ad_groups",
  ad: "ads",
};

/** Canonical governance entity kind per entity type. */
export const ENTITY_KIND_MAP: Record<{{Pascal}}EntityType, string> = {
  campaign: "campaign",
  ad_group: "ad_group",
  ad: "ad",
};

export function getEntityTypeEnum(): [{{Pascal}}EntityType, ...{{Pascal}}EntityType[]] {
  return [...ENTITY_TYPES];
}

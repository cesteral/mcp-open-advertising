// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Resource } from "../types.js";
import { getSupportedEntityTypes, type CM360EntityType } from "../../tools/utils/entity-mapping.js";

const ENTITY_SCHEMAS: Record<CM360EntityType, string> = {
  campaign: `# Campaign Schema

## Required Fields
- \`name\` (string) — Campaign name
- \`advertiserId\` (string) — Parent advertiser ID
- \`startDate\` (string) — Start date (YYYY-MM-DD)
- \`endDate\` (string) — End date (YYYY-MM-DD)

## Optional Fields
- \`archived\` (boolean) — Archive status
- \`defaultLandingPageId\` (string) — Default landing page
- \`externalId\` (string) — External identifier`,

  placement: `# Placement Schema

## Required Fields
- \`name\` (string) — Placement name
- \`campaignId\` (string) — Parent campaign ID
- \`siteId\` (string) — Site hosting the placement
- \`compatibility\` (string) — DISPLAY, IN_STREAM_VIDEO, etc.
- \`size\` (object) — { width: number, height: number }

## Optional Fields
- \`paymentSource\` (string) — PLACEMENT_AGENCY_PAID, PLACEMENT_PUBLISHER_PAID
- \`tagFormats\` (array) — PLACEMENT_TAG_STANDARD, etc.
- \`pricingSchedule\` (object) — Pricing configuration`,

  ad: `# Ad Schema

## Required Fields
- \`name\` (string) — Ad name
- \`campaignId\` (string) — Parent campaign ID
- \`type\` (string) — AD_SERVING_STANDARD_AD, AD_SERVING_DEFAULT_AD, etc.

## Key Fields
- \`placementAssignments\` (array) — [{ placementId, active }]
- \`creativeAssignments\` (array) — [{ creativeId, active }]
- \`active\` (boolean) — Whether ad is active
- \`startTime\` (string) — Start datetime
- \`endTime\` (string) — End datetime`,

  creative: `# Creative Schema

## Required Fields
- \`name\` (string) — Creative name
- \`advertiserId\` (string) — Parent advertiser ID
- \`type\` (string) — DISPLAY, DISPLAY_IMAGE_GALLERY, HTML5_BANNER, etc.
- \`size\` (object) — { width: number, height: number }

## Optional Fields
- \`active\` (boolean) — Active status
- \`clickTags\` (array) — Click tracking tags
- \`backupImageClickThroughUrl\` (object) — Fallback URL`,

  site: `# Site Schema

## Required Fields
- \`name\` (string) — Site name
- \`approved\` (boolean) — Approval status

## Optional Fields
- \`directorySiteId\` (string) — Directory site reference
- \`siteSettings\` (object) — Site-level settings`,

  advertiser: `# Advertiser Schema

## Required Fields
- \`name\` (string) — Advertiser name

## Key Fields
- \`status\` (string) — APPROVED, ON_HOLD
- \`defaultClickThroughEventTagId\` (string)
- \`floodlightConfigurationId\` (string) — Linked Floodlight config`,

  floodlightActivity: `# Floodlight Activity Schema

## Required Fields
- \`name\` (string) — Activity name
- \`floodlightConfigurationId\` (string) — Parent config ID
- \`floodlightActivityGroupName\` (string) — Activity group name
- \`floodlightTagType\` (string) — GLOBAL_SITE_TAG, IFRAME, IMAGE

## Optional Fields
- \`countingMethod\` (string) — STANDARD_COUNTING, UNIQUE_COUNTING, etc.
- \`expectedUrl\` (string) — Expected conversion page URL
- \`cacheBustingType\` (string) — Tag cache busting setting`,

  floodlightConfiguration: `# Floodlight Configuration Schema

## Key Fields (read-only, one per advertiser)
- \`advertiserId\` (string) — Linked advertiser
- \`lookbackConfiguration\` (object) — Attribution windows
- \`naturalSearchConversionAttributionOption\` (string) — Natural search settings
- \`firstDayOfWeek\` (string) — MONDAY or SUNDAY

## Notes
- Cannot be created; one auto-exists per advertiser
- Can be updated to modify lookback windows`,
};

export const entitySchemaResources: Resource[] = getSupportedEntityTypes().map((entityType) => ({
  uri: `entity-schema://${entityType}`,
  name: `${entityType} Schema`,
  description: `Field schema for CM360 ${entityType} entities`,
  mimeType: "text/markdown",
  getContent: () => ENTITY_SCHEMAS[entityType] || `# ${entityType}\n\nSchema not yet documented.`,
}));

export const entitySchemaAllResource: Resource = {
  uri: "entity-schema://all",
  name: "All CM360 Entity Schemas",
  description: "Combined schema reference for all CM360 entity types",
  mimeType: "text/markdown",
  getContent: () => getSupportedEntityTypes()
    .map((t) => ENTITY_SCHEMAS[t])
    .join("\n\n---\n\n"),
};
// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Snapchat Entity Schema Resources
 */
import type { Resource } from "../types.js";
import {
  getSupportedEntityTypes,
  type SnapchatEntityType,
} from "../../tools/utils/entity-mapping.js";

const ENTITY_SCHEMA_CONTENT: Record<SnapchatEntityType, string> = {
  campaign: JSON.stringify(
    {
      type: "object",
      required: ["name", "objective_v2_properties", "ad_account_id", "status", "start_time"],
      properties: {
        name: { type: "string", description: "Campaign name" },
        objective_v2_properties: {
          type: "object",
          description:
            "Campaign objective. Replaces the legacy `objective` attribute (Snap auto-translates legacy values but new integrations should not send it).",
          required: ["objective_v2_type"],
          properties: {
            objective_v2_type: {
              type: "string",
              enum: ["AWARENESS_AND_ENGAGEMENT", "APP_PROMOTION", "TRAFFIC", "SALES"],
            },
            promotion_type: {
              type: "string",
              description: "Refines the objective, e.g. APP_INSTALL for APP_PROMOTION",
            },
          },
        },
        status: { type: "string", enum: ["ACTIVE", "PAUSED"] },
        ad_account_id: { type: "string", description: "Ad account ID" },
        daily_budget_micro: {
          type: "integer",
          description: "Daily budget in micro-currency (1 USD = 1,000,000)",
        },
        lifetime_spend_cap_micro: {
          type: "integer",
          description: "Lifetime spend cap in micro-currency",
        },
        start_time: {
          type: "string",
          format: "date-time",
          description: "Campaign start time (ISO 8601)",
        },
        end_time: {
          type: "string",
          format: "date-time",
          description: "Campaign end time (ISO 8601)",
        },
      },
    },
    null,
    2
  ),

  adGroup: JSON.stringify(
    {
      type: "object",
      required: [
        "name",
        "campaign_id",
        "type",
        "placement_v2",
        "billing_event",
        "bid_strategy",
        "optimization_goal",
        "targeting",
      ],
      description:
        "Also requires one of daily_budget_micro or lifetime_budget_micro (minimum 5,000,000 micro).",
      properties: {
        name: { type: "string" },
        campaign_id: { type: "string" },
        status: { type: "string", enum: ["ACTIVE", "PAUSED"] },
        type: { type: "string", enum: ["SNAP_ADS", "LENS", "FILTER"] },
        billing_event: { type: "string", enum: ["IMPRESSION"] },
        bid_strategy: {
          type: "string",
          enum: ["AUTO_BID", "LOWEST_COST_WITH_MAX_BID", "TARGET_COST"],
        },
        daily_budget_micro: { type: "integer" },
        lifetime_budget_micro: { type: "integer" },
        bid_micro: {
          type: "integer",
          description:
            "Bid amount in micro-currency; required for LOWEST_COST_WITH_MAX_BID and TARGET_COST",
        },
        optimization_goal: {
          type: "string",
          enum: ["IMPRESSIONS", "SWIPES", "APP_INSTALLS", "VIDEO_VIEWS", "PIXEL_PURCHASE"],
        },
        targeting: { type: "object" },
        placement_v2: {
          type: "object",
          description:
            "Required. Replaces the legacy `placement` attribute, which Snap has rejected since June 2020.",
          required: ["config", "platforms"],
          properties: {
            config: { type: "string", enum: ["AUTOMATIC", "CUSTOM"] },
            platforms: { type: "array", items: { type: "string", enum: ["SNAPCHAT"] } },
            snapchat_positions: {
              type: "array",
              description: "Only when config is CUSTOM",
              items: {
                type: "string",
                enum: [
                  "INTERSTITIAL_USER",
                  "INTERSTITIAL_CONTENT",
                  "INTERSTITIAL_SPOTLIGHT",
                  "INSTREAM",
                  "PUBLIC_STORIES_INSTREAM",
                  "CHAT_FEED",
                  "FEED",
                  "CAMERA",
                  "POST_CAPTURE_CAROUSEL",
                ],
              },
            },
            inclusion: { type: "object", description: "{ content_types: [...] }" },
            exclusion: { type: "object", description: "{ content_types: [...] }" },
          },
        },
      },
    },
    null,
    2
  ),

  ad: JSON.stringify(
    {
      type: "object",
      required: ["name", "ad_squad_id", "creative_id"],
      properties: {
        name: { type: "string" },
        ad_squad_id: { type: "string" },
        creative_id: { type: "string" },
        status: { type: "string", enum: ["ACTIVE", "PAUSED"] },
        type: { type: "string", enum: ["SNAP_AD", "STORY", "COLLECTION"] },
      },
    },
    null,
    2
  ),

  creative: JSON.stringify(
    {
      type: "object",
      required: ["name", "type", "ad_account_id"],
      properties: {
        name: { type: "string" },
        type: {
          type: "string",
          enum: ["SNAP_AD", "STORY", "COLLECTION", "APP_INSTALL", "WEB_VIEW"],
        },
        ad_account_id: { type: "string" },
        brand_name: { type: "string" },
        headline: { type: "string" },
        call_to_action: {
          type: "string",
          enum: ["INSTALL_NOW", "SHOP_NOW", "LEARN_MORE", "SIGN_UP", "WATCH_NOW"],
        },
      },
    },
    null,
    2
  ),
};

function buildEntitySchemaMarkdown(entityType: SnapchatEntityType): string {
  return (
    ENTITY_SCHEMA_CONTENT[entityType] ??
    `# Snapchat ${entityType}\n\nNo schema information available.\n`
  );
}

function buildAllSchemasMarkdown(): string {
  return getSupportedEntityTypes()
    .map((t) => ENTITY_SCHEMA_CONTENT[t])
    .join("\n\n---\n\n");
}

export const entitySchemaResources: Resource[] = getSupportedEntityTypes().map((entityType) => ({
  uri: `entity-schema://snapchat/${entityType}`,
  name: `Snapchat ${entityType} Schema`,
  description: `Field reference for Snapchat ${entityType} entity including required fields, optional fields, and read-only fields`,
  mimeType: "text/markdown",
  getContent: () => buildEntitySchemaMarkdown(entityType),
}));

export const entitySchemaAllResource: Resource = {
  uri: "entity-schema://snapchat/all",
  name: "Snapchat All Entity Schemas",
  description: "Combined field reference for all Snapchat Ads entity types",
  mimeType: "text/markdown",
  getContent: buildAllSchemasMarkdown,
};

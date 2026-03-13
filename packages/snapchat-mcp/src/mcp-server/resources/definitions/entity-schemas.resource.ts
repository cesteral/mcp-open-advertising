/**
 * Snapchat Entity Schema Resources
 */
import type { Resource } from "../types.js";
import { getSupportedEntityTypes, type SnapchatEntityType } from "../../tools/utils/entity-mapping.js";

const ENTITY_SCHEMA_CONTENT: Record<SnapchatEntityType, string> = {
  campaign: JSON.stringify({
    type: "object",
    required: ["name", "objective", "ad_account_id"],
    properties: {
      name: { type: "string", description: "Campaign name" },
      objective: {
        type: "string",
        enum: [
          "AWARENESS",
          "APP_INSTALLS",
          "DRIVE_REPLAY",
          "LEAD_GENERATION",
          "WEBSITE_CONVERSIONS",
          "PRODUCT_CATALOG_SALES",
          "VIDEO_VIEWS",
        ],
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
  }, null, 2),

  adGroup: JSON.stringify({
    type: "object",
    required: ["name", "campaign_id"],
    properties: {
      name: { type: "string" },
      campaign_id: { type: "string" },
      status: { type: "string", enum: ["ACTIVE", "PAUSED"] },
      daily_budget_micro: { type: "integer" },
      bid_micro: {
        type: "integer",
        description: "Bid amount in micro-currency",
      },
      optimization_goal: {
        type: "string",
        enum: ["SWIPE", "PIXEL_PAGE_VIEW", "APP_INSTALL", "VIDEO_VIEWS", "STORY_OPENS"],
      },
      placement: {
        type: "string",
        enum: ["SNAP_ADS", "AUDIENCE_NETWORK", "BOTH"],
      },
    },
  }, null, 2),

  ad: JSON.stringify({
    type: "object",
    required: ["name", "ad_squad_id", "creative_id"],
    properties: {
      name: { type: "string" },
      ad_squad_id: { type: "string" },
      creative_id: { type: "string" },
      status: { type: "string", enum: ["ACTIVE", "PAUSED"] },
      type: { type: "string", enum: ["SNAP_AD", "STORY", "COLLECTION"] },
    },
  }, null, 2),

  creative: JSON.stringify({
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
  }, null, 2),
};

function buildEntitySchemaMarkdown(entityType: SnapchatEntityType): string {
  return ENTITY_SCHEMA_CONTENT[entityType] ?? `# Snapchat ${entityType}\n\nNo schema information available.\n`;
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

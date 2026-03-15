// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

// AUTO-GENERATED - DO NOT EDIT
// Generated from data/bid-manager-reference.json
// Run 'pnpm run generate' to regenerate

import { z } from "zod";

/**
 * All available Bid Manager API filter types
 * Total: 278 filters
 */
export const FilterTypeSchema = z.enum([
  "FILTER_ACTIVE_VIEW_CUSTOM_METRIC_ID",
  "FILTER_ACTIVE_VIEW_CUSTOM_METRIC_NAME",
  "FILTER_ACTIVE_VIEW_EXPECTED_VIEWABILITY",
  "FILTER_ADVERTISER",
  "FILTER_ADVERTISER_CURRENCY",
  "FILTER_ADVERTISER_INTEGRATION_CODE",
  "FILTER_ADVERTISER_INTEGRATION_STATUS",
  "FILTER_ADVERTISER_NAME",
  "FILTER_ADVERTISER_TIMEZONE",
  "FILTER_AD_POSITION",
  "FILTER_AD_TYPE",
  "FILTER_AGE",
  "FILTER_ALGORITHM",
  "FILTER_ALGORITHM_ID",
  "FILTER_AMP_PAGE_REQUEST",
  "FILTER_APP_URL",
  "FILTER_APP_URL_EXCLUDED",
  "FILTER_ASSET_COMBINATION_STRING",
  "FILTER_ATTRIBUTED_USERLIST",
  "FILTER_ATTRIBUTED_USERLIST_COMMERCE_PARTNER",
  "FILTER_ATTRIBUTED_USERLIST_COST",
  "FILTER_ATTRIBUTED_USERLIST_IS_COMMERCE",
  "FILTER_ATTRIBUTED_USERLIST_TYPE",
  "FILTER_ATTRIBUTION_MODEL",
  "FILTER_AUDIENCE_LIST",
  "FILTER_AUDIENCE_LIST_COST",
  "FILTER_AUDIENCE_LIST_TYPE",
  "FILTER_AUDIO_FEED_TYPE_NAME",
  "FILTER_AUTHORIZED_SELLER_STATE",
  "FILTER_BID_STRATEGY_TYPE_NAME",
  "FILTER_BILLABLE_OUTCOME",
  "FILTER_BRAND_LIFT_TYPE",
  "FILTER_BROWSER",
  "FILTER_BUDGET_SEGMENT_BUDGET",
  "FILTER_BUDGET_SEGMENT_DESCRIPTION",
  "FILTER_BUDGET_SEGMENT_END_DATE",
  "FILTER_BUDGET_SEGMENT_PACING_PERCENTAGE",
  "FILTER_BUDGET_SEGMENT_START_DATE",
  "FILTER_BUDGET_SEGMENT_TYPE",
  "FILTER_CAMPAIGN_DAILY_FREQUENCY",
  "FILTER_CARRIER",
  "FILTER_CARRIER_NAME",
  "FILTER_CART_DATA_ITEM_ID",
  "FILTER_CHANNEL_ID",
  "FILTER_CHANNEL_NAME",
  "FILTER_CHANNEL_TYPE",
  "FILTER_CITY",
  "FILTER_CITY_NAME",
  "FILTER_CM360_PLACEMENT_ID",
  "FILTER_COMMERCE_MEASUREMENT_FEE_COMMERCE_PARTNER_NAME",
  "FILTER_COMMERCE_MEASUREMENT_FEE_MERCHANT_ID",
  "FILTER_COMPANION_CREATIVE_ID",
  "FILTER_COMPANION_CREATIVE_NAME",
  "FILTER_CONTAINER_PERMISSIONED_LIST",
  "FILTER_CONVERSION_AD_EVENT_TYPE",
  "FILTER_CONVERSION_AD_EVENT_TYPE_ID",
  "FILTER_CONVERSION_DELAY",
  "FILTER_CONVERSION_SOURCE",
  "FILTER_CONVERSION_SOURCE_ID",
  "FILTER_COUNTRY",
  "FILTER_COUNTRY_ID",
  "FILTER_CREATIVE",
  "FILTER_CREATIVE_ASSET",
  "FILTER_CREATIVE_ATTRIBUTE",
  "FILTER_CREATIVE_HEIGHT",
  "FILTER_CREATIVE_ID",
  "FILTER_CREATIVE_INTEGRATION_CODE",
  "FILTER_CREATIVE_RENDERED_IN_AMP",
  "FILTER_CREATIVE_SIZE",
  "FILTER_CREATIVE_SOURCE",
  "FILTER_CREATIVE_STATUS",
  "FILTER_CREATIVE_TYPE",
  "FILTER_CREATIVE_WIDTH",
  "FILTER_CTV_AUDIENCE_EXPANSION",
  "FILTER_DATA_PROVIDER",
  "FILTER_DATA_PROVIDER_NAME",
  "FILTER_DATA_SOURCE",
  "FILTER_DATE",
  "FILTER_DAY_OF_WEEK",
  "FILTER_DEVICE_MAKE",
  "FILTER_DEVICE_MODEL",
  "FILTER_DEVICE_TYPE",
  "FILTER_DIGITAL_CONTENT_LABEL",
  "FILTER_DMA",
  "FILTER_DMA_NAME",
  "FILTER_DOMAIN",
  "FILTER_ELIGIBLE_COOKIES_ON_FIRST_PARTY_AUDIENCE_LIST",
  "FILTER_ELIGIBLE_COOKIES_ON_THIRD_PARTY_AUDIENCE_LIST_AND_INTEREST",
  "FILTER_EVENT_PLATFORM_TYPE",
  "FILTER_EVENT_TYPE",
  "FILTER_EXCHANGE",
  "FILTER_EXCHANGE_CODE",
  "FILTER_EXCHANGE_ID",
  "FILTER_EXTENSION",
  "FILTER_EXTENSION_ASSET",
  "FILTER_EXTENSION_ASSET_STATUS",
  "FILTER_EXTENSION_ASSET_TYPE",
  "FILTER_EXTENSION_STATUS",
  "FILTER_EXTENSION_TYPE",
  "FILTER_FIRST_PARTY_AUDIENCE_LIST_COST",
  "FILTER_FIRST_PARTY_AUDIENCE_LIST_TYPE",
  "FILTER_FLOODLIGHT_ACTIVITY",
  "FILTER_FLOODLIGHT_ACTIVITY_CONVERSION_CATEGORY",
  "FILTER_FLOODLIGHT_ACTIVITY_ID",
  "FILTER_FORMAT",
  "FILTER_GENDER",
  "FILTER_GMAIL_GENDER",
  "FILTER_GUILDER_PRODUCT_ID",
  "FILTER_IMPRESSION_COUNTING_METHOD",
  "FILTER_IMPRESSION_LOSS_REJECTION_REASON",
  "FILTER_INSERTION_ORDER",
  "FILTER_INSERTION_ORDER_GOAL_TYPE",
  "FILTER_INSERTION_ORDER_GOAL_VALUE",
  "FILTER_INSERTION_ORDER_INTEGRATION_CODE",
  "FILTER_INSERTION_ORDER_NAME",
  "FILTER_INSERTION_ORDER_STATUS",
  "FILTER_INVENTORY_COMMITMENT_TYPE",
  "FILTER_INVENTORY_DELIVERY_METHOD",
  "FILTER_INVENTORY_FORMAT",
  "FILTER_INVENTORY_MEDIA_COST_TYPE",
  "FILTER_INVENTORY_RATE_TYPE",
  "FILTER_INVENTORY_SOURCE",
  "FILTER_INVENTORY_SOURCES_PERMISSIONS",
  "FILTER_INVENTORY_SOURCE_EXTERNAL_ID",
  "FILTER_INVENTORY_SOURCE_GROUP",
  "FILTER_INVENTORY_SOURCE_GROUP_ID",
  "FILTER_INVENTORY_SOURCE_ID",
  "FILTER_INVENTORY_SOURCE_NAME",
  "FILTER_INVENTORY_SOURCE_TYPE",
  "FILTER_IS_YOUTUBE_TV",
  "FILTER_KEYWORD",
  "FILTER_LIFE_EVENTS",
  "FILTER_LINE_ITEM",
  "FILTER_LINE_ITEM_BUDGET",
  "FILTER_LINE_ITEM_DAILY_FREQUENCY",
  "FILTER_LINE_ITEM_END_DATE",
  "FILTER_LINE_ITEM_INTEGRATION_CODE",
  "FILTER_LINE_ITEM_LIFETIME_FREQUENCY",
  "FILTER_LINE_ITEM_NAME",
  "FILTER_LINE_ITEM_PACING_PERCENTAGE",
  "FILTER_LINE_ITEM_START_DATE",
  "FILTER_LINE_ITEM_STATUS",
  "FILTER_LINE_ITEM_TYPE",
  "FILTER_LOCATION_ASSET",
  "FILTER_LOCATION_ASSET_STATUS",
  "FILTER_LOCATION_ASSET_TYPE",
  "FILTER_MATCHED_GENRE_TARGET",
  "FILTER_MATCH_RATIO",
  "FILTER_MEASUREMENT_SOURCE",
  "FILTER_MEDIA_PLAN",
  "FILTER_MEDIA_PLAN_NAME",
  "FILTER_MEDIA_TYPE",
  "FILTER_MOBILE_GEO",
  "FILTER_MONITORED_ENTITY_PRIORITIZATION_NAME",
  "FILTER_MONTH",
  "FILTER_MRAID_SUPPORT",
  "FILTER_NIELSEN_COUNTRY_CODE",
  "FILTER_NIELSEN_DATE_RANGE",
  "FILTER_NIELSEN_DEVICE_ID",
  "FILTER_OMID_CAPABLE",
  "FILTER_OM_SDK_AVAILABLE",
  "FILTER_ORDER_ID",
  "FILTER_OS",
  "FILTER_OTHER_ADVERTISER_ID",
  "FILTER_OTHER_ADVERTISER_NAME",
  "FILTER_OTHER_CAMPAIGN_ID",
  "FILTER_OTHER_CAMPAIGN_NAME",
  "FILTER_OTHER_DEVICE_TYPE",
  "FILTER_PAGE_CATEGORY",
  "FILTER_PAGE_LAYOUT",
  "FILTER_PARTNER",
  "FILTER_PARTNER_CURRENCY",
  "FILTER_PARTNER_NAME",
  "FILTER_PARTNER_STATUS",
  "FILTER_PLACEMENT_ALL_YOUTUBE_CHANNELS",
  "FILTER_PLACEMENT_NAME_ALL_YOUTUBE_CHANNELS",
  "FILTER_PLATFORM",
  "FILTER_PLAYBACK_METHOD",
  "FILTER_POSITION_IN_CONTENT",
  "FILTER_PUBLIC_INVENTORY",
  "FILTER_PUBLISHER_TRAFFIC_SOURCE",
  "FILTER_QUARTER",
  "FILTER_REFRESHED_AD_NAME",
  "FILTER_REFUND_REASON",
  "FILTER_REGION",
  "FILTER_REGION_NAME",
  "FILTER_REWARDED",
  "FILTER_SENSITIVE_CATEGORY",
  "FILTER_SERVED_PIXEL_DENSITY",
  "FILTER_SITE_ID",
  "FILTER_SITE_LANGUAGE",
  "FILTER_SKIPPABLE_SUPPORT",
  "FILTER_SUBDOMAIN",
  "FILTER_TARGETED_DATA_PROVIDERS",
  "FILTER_TARGETED_LOCATION_DIMENSION_STRING",
  "FILTER_TARGETED_USER_LIST",
  "FILTER_TARGETING_EXPANSION",
  "FILTER_THIRD_PARTY_AUDIENCE_LIST_COST",
  "FILTER_THIRD_PARTY_AUDIENCE_LIST_TYPE",
  "FILTER_TIME_OF_DAY",
  "FILTER_TRUEVIEW_AD",
  "FILTER_TRUEVIEW_AD_FORMAT",
  "FILTER_TRUEVIEW_AD_GROUP",
  "FILTER_TRUEVIEW_AD_GROUP_AD_ID",
  "FILTER_TRUEVIEW_AD_GROUP_ID",
  "FILTER_TRUEVIEW_AD_TYPE_NAME",
  "FILTER_TRUEVIEW_AGE",
  "FILTER_TRUEVIEW_AUDIENCE_SEGMENT",
  "FILTER_TRUEVIEW_AUDIENCE_SEGMENT_TYPE",
  "FILTER_TRUEVIEW_CATEGORY",
  "FILTER_TRUEVIEW_CITY",
  "FILTER_TRUEVIEW_CLICK_TYPE_NAME",
  "FILTER_TRUEVIEW_CONTENT_SUITABILITY_DETAIL_NAME",
  "FILTER_TRUEVIEW_CONTENT_SUITABILITY_DETAIL_TYPE_NAME",
  "FILTER_TRUEVIEW_CONTENT_SUITABILITY_GROUP_NAME",
  "FILTER_TRUEVIEW_CONVERSION_TYPE",
  "FILTER_TRUEVIEW_COUNTRY",
  "FILTER_TRUEVIEW_CUSTOM_AFFINITY",
  "FILTER_TRUEVIEW_DETAILED_DEMOGRAPHICS",
  "FILTER_TRUEVIEW_DETAILED_DEMOGRAPHICS_ID",
  "FILTER_TRUEVIEW_DMA",
  "FILTER_TRUEVIEW_DMA_NAME",
  "FILTER_TRUEVIEW_GENDER",
  "FILTER_TRUEVIEW_HOUSEHOLD_INCOME",
  "FILTER_TRUEVIEW_INTEREST",
  "FILTER_TRUEVIEW_KEYWORD",
  "FILTER_TRUEVIEW_PARENTAL_STATUS",
  "FILTER_TRUEVIEW_PLACEMENT",
  "FILTER_TRUEVIEW_PLACEMENT_ID",
  "FILTER_TRUEVIEW_REGION",
  "FILTER_TRUEVIEW_REGION_NAME",
  "FILTER_TRUEVIEW_REMARKETING_LIST",
  "FILTER_TRUEVIEW_REMARKETING_LIST_NAME",
  "FILTER_TRUEVIEW_TARGETING_EXPANSION",
  "FILTER_TRUEVIEW_URL",
  "FILTER_TRUEVIEW_ZIPCODE",
  "FILTER_UNIQUE_REACH_SAMPLE_SIZE_ID",
  "FILTER_USER_LIST",
  "FILTER_USER_LIST_FIRST_PARTY",
  "FILTER_USER_LIST_FIRST_PARTY_NAME",
  "FILTER_USER_LIST_THIRD_PARTY",
  "FILTER_USER_LIST_THIRD_PARTY_NAME",
  "FILTER_UTC_DATE",
  "FILTER_VARIANT_ID",
  "FILTER_VARIANT_NAME",
  "FILTER_VARIANT_VERSION",
  "FILTER_VENDOR_MEASUREMENT_MODE",
  "FILTER_VERIFICATION_AUDIBILITY_COMPLETE",
  "FILTER_VERIFICATION_AUDIBILITY_START",
  "FILTER_VERIFICATION_VIDEO_PLAYER_SIZE",
  "FILTER_VERIFICATION_VIDEO_PLAYER_SIZE_COMPLETE",
  "FILTER_VERIFICATION_VIDEO_PLAYER_SIZE_FIRST_QUARTILE",
  "FILTER_VERIFICATION_VIDEO_PLAYER_SIZE_MID_POINT",
  "FILTER_VERIFICATION_VIDEO_PLAYER_SIZE_START",
  "FILTER_VERIFICATION_VIDEO_PLAYER_SIZE_THIRD_QUARTILE",
  "FILTER_VERIFICATION_VIDEO_POSITION",
  "FILTER_VERIFICATION_VIDEO_RESIZED",
  "FILTER_VIDEO_AD_POSITION_IN_STREAM",
  "FILTER_VIDEO_COMPANION_CREATIVE_SIZE",
  "FILTER_VIDEO_CONTENT_DURATION",
  "FILTER_VIDEO_CONTENT_LIVE_STREAM",
  "FILTER_VIDEO_CONTINUOUS_PLAY",
  "FILTER_VIDEO_CREATIVE_DURATION",
  "FILTER_VIDEO_CREATIVE_DURATION_SKIPPABLE",
  "FILTER_VIDEO_DURATION",
  "FILTER_VIDEO_DURATION_SECONDS",
  "FILTER_VIDEO_DURATION_SECONDS_RANGE",
  "FILTER_VIDEO_FORMAT_SUPPORT",
  "FILTER_VIDEO_PLAYER_SIZE",
  "FILTER_VIDEO_RATING_TIER",
  "FILTER_VIDEO_SKIPPABLE_SUPPORT",
  "FILTER_WEEK",
  "FILTER_YEAR",
  "FILTER_YOUTUBE_AD_VIDEO",
  "FILTER_YOUTUBE_AD_VIDEO_ID",
  "FILTER_YOUTUBE_PROGRAMMATIC_GUARANTEED_ADVERTISER",
  "FILTER_ZIP_CODE",
  "FILTER_ZIP_POSTAL_CODE"
]);

export type FilterType = z.infer<typeof FilterTypeSchema>;

/**
 * Filter metadata for documentation and validation
 */
export interface FilterMetadata {
  displayName: string;
  reportBuilderName: string;
  category: string;
  description: string;
  usage: ("filter" | "groupBy")[];
  reportTypes?: string[];
  notes?: string;
}

/**
 * Complete metadata for all filters
 */
export const FILTER_METADATA: Record<FilterType, FilterMetadata> = {
  "FILTER_ACTIVE_VIEW_CUSTOM_METRIC_ID": {
    displayName: "Active View Custom Metric ID",
    reportBuilderName: "Active View: Custom Metric ID",
    category: "Viewability",
    description: "Custom metric ID for Active View measurement",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_ACTIVE_VIEW_CUSTOM_METRIC_NAME": {
    displayName: "Active View Custom Metric Name",
    reportBuilderName: "Active View: Custom Metric Name",
    category: "Viewability",
    description: "Custom metric name for Active View measurement",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_ACTIVE_VIEW_EXPECTED_VIEWABILITY": {
    displayName: "Active View Expected Viewability",
    reportBuilderName: "Active View Expected Viewability",
    category: "Viewability",
    description: "Expected viewability percentage from Active View",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_ADVERTISER": {
    displayName: "Advertiser ID",
    reportBuilderName: "Advertiser ID",
    category: "Entity",
    description: "DV360 Advertiser ID for filtering or grouping",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_ADVERTISER_CURRENCY": {
    displayName: "Advertiser Currency",
    reportBuilderName: "Advertiser Currency",
    category: "Entity",
    description: "Currency code for the advertiser",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_ADVERTISER_INTEGRATION_CODE": {
    displayName: "Advertiser Integration Code",
    reportBuilderName: "Advertiser Integration Code",
    category: "Entity",
    description: "Custom integration code for advertiser",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_ADVERTISER_INTEGRATION_STATUS": {
    displayName: "Advertiser Status",
    reportBuilderName: "Advertiser Status",
    category: "Entity",
    description: "Integration status of the advertiser",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_ADVERTISER_NAME": {
    displayName: "Advertiser",
    reportBuilderName: "Advertiser",
    category: "Entity",
    description: "Advertiser name",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_ADVERTISER_TIMEZONE": {
    displayName: "Advertiser Time Zone",
    reportBuilderName: "Advertiser Time Zone",
    category: "Entity",
    description: "Time zone setting for the advertiser",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_AD_POSITION": {
    displayName: "Ad Position",
    reportBuilderName: "Ad Position",
    category: "Inventory",
    description: "Position of the ad on the page",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_AD_TYPE": {
    displayName: "Ad Type",
    reportBuilderName: "Ad Type",
    category: "Creative",
    description: "Type of advertisement",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_AGE": {
    displayName: "Age",
    reportBuilderName: "Age",
    category: "Audience",
    description: "Age demographic segment",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_ALGORITHM": {
    displayName: "Algorithm",
    reportBuilderName: "Algorithm",
    category: "Bidding",
    description: "Bidding algorithm name",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_ALGORITHM_ID": {
    displayName: "Algorithm ID",
    reportBuilderName: "Algorithm ID",
    category: "Bidding",
    description: "Bidding algorithm ID",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_AMP_PAGE_REQUEST": {
    displayName: "AMP Page Request",
    reportBuilderName: "AMP Page Request",
    category: "Inventory",
    description: "Whether the request came from an AMP page",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_APP_URL": {
    displayName: "App/URL",
    reportBuilderName: "App/URL",
    category: "Inventory",
    description: "Application or website URL",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_APP_URL_EXCLUDED": {
    displayName: "App/URL Excluded",
    reportBuilderName: "App/URL Excluded",
    category: "Inventory",
    description: "Excluded applications or URLs",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_ASSET_COMBINATION_STRING": {
    displayName: "Asset Combination",
    reportBuilderName: "Asset Combination",
    category: "Creative",
    description: "Combination of creative assets",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_ATTRIBUTED_USERLIST": {
    displayName: "Attributed Userlist",
    reportBuilderName: "Attributed Userlist",
    category: "Audience",
    description: "User list attributed to conversion",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_ATTRIBUTED_USERLIST_COMMERCE_PARTNER": {
    displayName: "Commerce Partner",
    reportBuilderName: "Commerce Partner",
    category: "Audience",
    description: "Commerce partner for attributed userlist",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_ATTRIBUTED_USERLIST_COST": {
    displayName: "Attributed Userlist Cost",
    reportBuilderName: "Attributed Userlist Cost",
    category: "Audience",
    description: "Cost associated with attributed userlist",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_ATTRIBUTED_USERLIST_IS_COMMERCE": {
    displayName: "Is Commerce",
    reportBuilderName: "Is Commerce",
    category: "Audience",
    description: "Whether the userlist is commerce-related",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_ATTRIBUTED_USERLIST_TYPE": {
    displayName: "Attributed Userlist Type",
    reportBuilderName: "Attributed Userlist Type",
    category: "Audience",
    description: "Type of attributed userlist",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_ATTRIBUTION_MODEL": {
    displayName: "Attribution Model",
    reportBuilderName: "Attribution Model",
    category: "Conversion",
    description: "Attribution model used for conversions",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_AUDIENCE_LIST": {
    displayName: "Audience List",
    reportBuilderName: "Audience List",
    category: "Audience",
    description: "Audience list ID or name",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_AUDIENCE_LIST_COST": {
    displayName: "Audience List Cost",
    reportBuilderName: "Audience List Cost",
    category: "Audience",
    description: "Cost of audience list usage",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_AUDIENCE_LIST_TYPE": {
    displayName: "Audience List Type",
    reportBuilderName: "Audience List Type",
    category: "Audience",
    description: "Type of audience list",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_AUDIO_FEED_TYPE_NAME": {
    displayName: "Audio Feed Type",
    reportBuilderName: "Audio Feed Type",
    category: "Audio",
    description: "Type of audio content feed",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_AUTHORIZED_SELLER_STATE": {
    displayName: "Authorized Seller State",
    reportBuilderName: "Authorized Seller State",
    category: "Inventory",
    description: "Authorization state of the seller",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_BID_STRATEGY_TYPE_NAME": {
    displayName: "Bid Strategy Type",
    reportBuilderName: "Bid Strategy Type",
    category: "Bidding",
    description: "Type of bidding strategy",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_BILLABLE_OUTCOME": {
    displayName: "Billable Outcome",
    reportBuilderName: "Billable Outcome",
    category: "Cost",
    description: "Type of billable outcome",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_BRAND_LIFT_TYPE": {
    displayName: "Brand Lift Type",
    reportBuilderName: "Brand Lift Type",
    category: "Measurement",
    description: "Type of brand lift measurement",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_BROWSER": {
    displayName: "Browser",
    reportBuilderName: "Browser",
    category: "Targeting",
    description: "Web browser type",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_BUDGET_SEGMENT_BUDGET": {
    displayName: "Budget Segment Budget",
    reportBuilderName: "Budget Segment Budget",
    category: "Budget",
    description: "Budget amount for the segment",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_BUDGET_SEGMENT_DESCRIPTION": {
    displayName: "Budget Segment Name",
    reportBuilderName: "Budget Segment Name",
    category: "Budget",
    description: "Name of the budget segment",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_BUDGET_SEGMENT_END_DATE": {
    displayName: "Budget Segment End Date",
    reportBuilderName: "Budget Segment End Date",
    category: "Budget",
    description: "End date of the budget segment",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_BUDGET_SEGMENT_PACING_PERCENTAGE": {
    displayName: "Budget Segment Pacing Percentage",
    reportBuilderName: "Budget Segment Pacing Percentage",
    category: "Budget",
    description: "Pacing percentage for budget segment",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_BUDGET_SEGMENT_START_DATE": {
    displayName: "Budget Segment Start Date",
    reportBuilderName: "Budget Segment Start Date",
    category: "Budget",
    description: "Start date of the budget segment",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_BUDGET_SEGMENT_TYPE": {
    displayName: "Budget Type (Segment)",
    reportBuilderName: "Budget Type (Segment)",
    category: "Budget",
    description: "Type of budget segment",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_CAMPAIGN_DAILY_FREQUENCY": {
    displayName: "Insertion Order Daily Frequency",
    reportBuilderName: "Insertion Order Daily Frequency",
    category: "Entity",
    description: "Daily frequency cap at campaign level",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_CARRIER": {
    displayName: "ISP or Carrier ID",
    reportBuilderName: "ISP or Carrier ID",
    category: "Targeting",
    description: "Mobile carrier or ISP ID",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_CARRIER_NAME": {
    displayName: "ISP or Carrier",
    reportBuilderName: "ISP or Carrier",
    category: "Targeting",
    description: "Mobile carrier or ISP name",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_CART_DATA_ITEM_ID": {
    displayName: "Item Id Sold",
    reportBuilderName: "Item Id Sold",
    category: "Commerce",
    description: "ID of item sold from cart",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_CHANNEL_ID": {
    displayName: "Channel ID",
    reportBuilderName: "Channel ID",
    category: "Inventory",
    description: "Channel identifier",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_CHANNEL_NAME": {
    displayName: "Channel",
    reportBuilderName: "Channel",
    category: "Inventory",
    description: "Channel name",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_CHANNEL_TYPE": {
    displayName: "Channel Type",
    reportBuilderName: "Channel Type",
    category: "Inventory",
    description: "Type of channel",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_CITY": {
    displayName: "City ID",
    reportBuilderName: "City ID",
    category: "Targeting",
    description: "City identifier",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_CITY_NAME": {
    displayName: "City",
    reportBuilderName: "City",
    category: "Targeting",
    description: "City name",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_CM360_PLACEMENT_ID": {
    displayName: "CM360 Placement ID",
    reportBuilderName: "CM360 Placement ID",
    category: "Creative",
    description: "Campaign Manager 360 placement ID",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_COMMERCE_MEASUREMENT_FEE_COMMERCE_PARTNER_NAME": {
    displayName: "Commerce Partner Name (Commerce Measurement Fee)",
    reportBuilderName: "Commerce Partner Name (Commerce Measurement Fee)",
    category: "Commerce",
    description: "Commerce partner name for measurement fee",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_COMMERCE_MEASUREMENT_FEE_MERCHANT_ID": {
    displayName: "Merchant ID (Commerce Measurement Fee)",
    reportBuilderName: "Merchant ID (Commerce Measurement Fee)",
    category: "Commerce",
    description: "Merchant ID for commerce measurement fee",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_COMPANION_CREATIVE_ID": {
    displayName: "Companion Creative ID",
    reportBuilderName: "Companion Creative ID",
    category: "Creative",
    description: "ID of companion creative",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_COMPANION_CREATIVE_NAME": {
    displayName: "Companion Creative",
    reportBuilderName: "Companion Creative",
    category: "Creative",
    description: "Name of companion creative",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_CONTAINER_PERMISSIONED_LIST": {
    displayName: "Commitment ID",
    reportBuilderName: "Commitment ID",
    category: "Inventory",
    description: "Container permissioned list ID",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_CONVERSION_AD_EVENT_TYPE": {
    displayName: "Conversion Ad Event Type",
    reportBuilderName: "Conversion Ad Event Type",
    category: "Conversion",
    description: "Type of ad event for conversion",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_CONVERSION_AD_EVENT_TYPE_ID": {
    displayName: "Conversion Ad Event Type ID",
    reportBuilderName: "Conversion Ad Event Type ID",
    category: "Conversion",
    description: "ID of ad event type for conversion",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_CONVERSION_DELAY": {
    displayName: "Time to Conversion",
    reportBuilderName: "Time to Conversion",
    category: "Conversion",
    description: "Time elapsed before conversion",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_CONVERSION_SOURCE": {
    displayName: "Conversion Source",
    reportBuilderName: "Conversion Source",
    category: "Conversion",
    description: "Source of the conversion",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_CONVERSION_SOURCE_ID": {
    displayName: "Conversion Source ID",
    reportBuilderName: "Conversion Source ID",
    category: "Conversion",
    description: "ID of conversion source",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_COUNTRY": {
    displayName: "Country",
    reportBuilderName: "Country",
    category: "Targeting",
    description: "Country name",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_COUNTRY_ID": {
    displayName: "Country ID",
    reportBuilderName: "Country",
    category: "Targeting",
    description: "Country identifier",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_CREATIVE": {
    displayName: "Creative",
    reportBuilderName: "Creative",
    category: "Creative",
    description: "Creative name",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_CREATIVE_ASSET": {
    displayName: "Creative Asset",
    reportBuilderName: "Creative Asset",
    category: "Creative",
    description: "Asset within the creative",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_CREATIVE_ATTRIBUTE": {
    displayName: "Creative Attributes",
    reportBuilderName: "Creative Attributes",
    category: "Creative",
    description: "Attributes of the creative",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_CREATIVE_HEIGHT": {
    displayName: "Creative Height",
    reportBuilderName: "Creative Height",
    category: "Creative",
    description: "Height of creative in pixels",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_CREATIVE_ID": {
    displayName: "Creative ID",
    reportBuilderName: "Creative ID",
    category: "Creative",
    description: "Creative identifier",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_CREATIVE_INTEGRATION_CODE": {
    displayName: "Creative Integration Code",
    reportBuilderName: "Creative Integration Code",
    category: "Creative",
    description: "Custom integration code for creative",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_CREATIVE_RENDERED_IN_AMP": {
    displayName: "Creative Rendered in AMP",
    reportBuilderName: "Creative Rendered in AMP",
    category: "Creative",
    description: "Whether creative was rendered in AMP",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_CREATIVE_SIZE": {
    displayName: "Creative Size",
    reportBuilderName: "Creative Size",
    category: "Creative",
    description: "Dimensions of the creative",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_CREATIVE_SOURCE": {
    displayName: "Creative Source",
    reportBuilderName: "Creative Source",
    category: "Creative",
    description: "Source of the creative",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_CREATIVE_STATUS": {
    displayName: "Creative Status",
    reportBuilderName: "Creative Status",
    category: "Creative",
    description: "Status of the creative",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_CREATIVE_TYPE": {
    displayName: "Creative Type",
    reportBuilderName: "Creative Type",
    category: "Creative",
    description: "Type of creative",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_CREATIVE_WIDTH": {
    displayName: "Creative Width",
    reportBuilderName: "Creative Width",
    category: "Creative",
    description: "Width of creative in pixels",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_CTV_AUDIENCE_EXPANSION": {
    displayName: "CTV Audience Expansion",
    reportBuilderName: "CTV Audience Expansion",
    category: "Targeting",
    description: "CTV audience expansion setting",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_DATA_PROVIDER": {
    displayName: "Data Provider ID",
    reportBuilderName: "Data Provider ID",
    category: "Audience",
    description: "Data provider identifier",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_DATA_PROVIDER_NAME": {
    displayName: "Data Provider",
    reportBuilderName: "Data Provider",
    category: "Audience",
    description: "Data provider name",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_DATA_SOURCE": {
    displayName: "Data Source",
    reportBuilderName: "Data Source",
    category: "Audience",
    description: "Source of audience data",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_DATE": {
    displayName: "Date",
    reportBuilderName: "Date",
    category: "Time",
    description: "Date dimension for daily breakdown",
    usage: ["groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_DAY_OF_WEEK": {
    displayName: "Day of Week",
    reportBuilderName: "Day of Week",
    category: "Time",
    description: "Day of the week",
    usage: ["groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_DEVICE_MAKE": {
    displayName: "Device Make",
    reportBuilderName: "Device Make",
    category: "Targeting",
    description: "Device manufacturer",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_DEVICE_MODEL": {
    displayName: "Device Model",
    reportBuilderName: "Device Model",
    category: "Targeting",
    description: "Device model",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_DEVICE_TYPE": {
    displayName: "Device Type",
    reportBuilderName: "Device Type",
    category: "Targeting",
    description: "Type of device (Desktop, Mobile, Tablet, Connected TV)",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_DIGITAL_CONTENT_LABEL": {
    displayName: "Digital Content Label",
    reportBuilderName: "Digital Content Label",
    category: "Inventory",
    description: "Content rating label",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_DMA": {
    displayName: "DMA Code",
    reportBuilderName: "DMA Code",
    category: "Targeting",
    description: "Designated Market Area code (US)",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_DMA_NAME": {
    displayName: "DMA",
    reportBuilderName: "DMA",
    category: "Targeting",
    description: "Designated Market Area name (US)",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_DOMAIN": {
    displayName: "Domain",
    reportBuilderName: "Domain",
    category: "Inventory",
    description: "Website domain",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_ELIGIBLE_COOKIES_ON_FIRST_PARTY_AUDIENCE_LIST": {
    displayName: "Eligible Cookies on First-Party Audience List",
    reportBuilderName: "Eligible Cookies on First-Party Audience List",
    category: "Audience",
    description: "Cookies eligible on first-party list",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_ELIGIBLE_COOKIES_ON_THIRD_PARTY_AUDIENCE_LIST_AND_INTEREST": {
    displayName: "Eligible Cookies on Third-Party Audience List and Interest",
    reportBuilderName: "Eligible Cookies on Third-Party Audience List and Interest",
    category: "Audience",
    description: "Cookies eligible on third-party list",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_EVENT_PLATFORM_TYPE": {
    displayName: "Attributed Event Platform Type",
    reportBuilderName: "Attributed Event Platform Type",
    category: "Conversion",
    description: "Platform type for attributed event",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_EVENT_TYPE": {
    displayName: "Event Type",
    reportBuilderName: "Event Type",
    category: "Conversion",
    description: "Type of conversion event",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_EXCHANGE": {
    displayName: "Exchange",
    reportBuilderName: "Exchange",
    category: "Inventory",
    description: "Ad exchange name",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_EXCHANGE_CODE": {
    displayName: "Exchange Code",
    reportBuilderName: "Exchange Code",
    category: "Inventory",
    description: "Ad exchange code",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_EXCHANGE_ID": {
    displayName: "Exchange ID",
    reportBuilderName: "Exchange ID",
    category: "Inventory",
    description: "Ad exchange identifier",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_EXTENSION": {
    displayName: "Asset",
    reportBuilderName: "Asset",
    category: "Creative",
    description: "Creative extension/asset",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_EXTENSION_ASSET": {
    displayName: "Asset (upgraded)",
    reportBuilderName: "Asset (upgraded)",
    category: "Creative",
    description: "Upgraded creative extension/asset",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_EXTENSION_ASSET_STATUS": {
    displayName: "Asset Status (upgraded)",
    reportBuilderName: "Asset Status (upgraded)",
    category: "Creative",
    description: "Status of upgraded asset",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_EXTENSION_ASSET_TYPE": {
    displayName: "Asset Type (upgraded)",
    reportBuilderName: "Asset Type (upgraded)",
    category: "Creative",
    description: "Type of upgraded asset",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_EXTENSION_STATUS": {
    displayName: "Asset Status",
    reportBuilderName: "Asset Status",
    category: "Creative",
    description: "Status of creative asset",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_EXTENSION_TYPE": {
    displayName: "Asset Type",
    reportBuilderName: "Asset Type",
    category: "Creative",
    description: "Type of creative asset",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_FIRST_PARTY_AUDIENCE_LIST_COST": {
    displayName: "First Party Audience List Cost",
    reportBuilderName: "First Party Audience List Cost",
    category: "Audience",
    description: "Cost of first-party audience list",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_FIRST_PARTY_AUDIENCE_LIST_TYPE": {
    displayName: "First Party Audience List Type",
    reportBuilderName: "First Party Audience List Type",
    category: "Audience",
    description: "Type of first-party audience list",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_FLOODLIGHT_ACTIVITY": {
    displayName: "Floodlight Activity",
    reportBuilderName: "Floodlight Activity",
    category: "Conversion",
    description: "Floodlight activity name",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT"]
  },
  "FILTER_FLOODLIGHT_ACTIVITY_CONVERSION_CATEGORY": {
    displayName: "Floodlight Activity Conversion Category",
    reportBuilderName: "Floodlight Activity Conversion Category",
    category: "Conversion",
    description: "Category of Floodlight conversion",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT"]
  },
  "FILTER_FLOODLIGHT_ACTIVITY_ID": {
    displayName: "Floodlight Activity ID",
    reportBuilderName: "Floodlight Activity ID",
    category: "Conversion",
    description: "Floodlight activity identifier",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT"]
  },
  "FILTER_FORMAT": {
    displayName: "Format",
    reportBuilderName: "Format",
    category: "Creative",
    description: "Ad format",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_GENDER": {
    displayName: "Gender",
    reportBuilderName: "Gender",
    category: "Audience",
    description: "Gender demographic",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_GMAIL_GENDER": {
    displayName: "Gender (Gmail)",
    reportBuilderName: "Gender",
    category: "Audience",
    description: "Gender for Gmail ads",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_GUILDER_PRODUCT_ID": {
    displayName: "Sponsored Product Id",
    reportBuilderName: "Sponsored Product Id",
    category: "Commerce",
    description: "Sponsored product identifier",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_IMPRESSION_COUNTING_METHOD": {
    displayName: "Impression Counting Method",
    reportBuilderName: "Impression Counting Method",
    category: "Delivery",
    description: "Method used to count impressions",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_IMPRESSION_LOSS_REJECTION_REASON": {
    displayName: "Rejection Reason",
    reportBuilderName: "Rejection Reason",
    category: "Delivery",
    description: "Reason for impression rejection",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_INSERTION_ORDER": {
    displayName: "Insertion Order ID",
    reportBuilderName: "Insertion Order ID",
    category: "Entity",
    description: "Insertion Order identifier",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_INSERTION_ORDER_GOAL_TYPE": {
    displayName: "Insertion Order Goal Type",
    reportBuilderName: "Insertion Order Goal Type",
    category: "Entity",
    description: "Goal type for Insertion Order",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_INSERTION_ORDER_GOAL_VALUE": {
    displayName: "Insertion Order Goal Value",
    reportBuilderName: "Insertion Order Goal Value",
    category: "Entity",
    description: "Goal value for Insertion Order",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_INSERTION_ORDER_INTEGRATION_CODE": {
    displayName: "Insertion Order Integration Code",
    reportBuilderName: "Insertion Order Integration Code",
    category: "Entity",
    description: "Custom integration code for IO",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_INSERTION_ORDER_NAME": {
    displayName: "Insertion Order",
    reportBuilderName: "Insertion Order",
    category: "Entity",
    description: "Insertion Order name",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_INSERTION_ORDER_STATUS": {
    displayName: "Insertion Order Status",
    reportBuilderName: "Insertion Order Status",
    category: "Entity",
    description: "Status of Insertion Order",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_INVENTORY_COMMITMENT_TYPE": {
    displayName: "Inventory Commitment Type",
    reportBuilderName: "Inventory Commitment Type",
    category: "Inventory",
    description: "Type of inventory commitment",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_INVENTORY_DELIVERY_METHOD": {
    displayName: "Inventory Delivery Method",
    reportBuilderName: "Inventory Delivery Method",
    category: "Inventory",
    description: "Method of inventory delivery",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_INVENTORY_FORMAT": {
    displayName: "Format (Inventory)",
    reportBuilderName: "Format",
    category: "Inventory",
    description: "Inventory format",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_INVENTORY_MEDIA_COST_TYPE": {
    displayName: "Inventory Media Cost Type",
    reportBuilderName: "Inventory Media Cost Type",
    category: "Inventory",
    description: "Media cost type for inventory",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_INVENTORY_RATE_TYPE": {
    displayName: "Inventory Rate Type",
    reportBuilderName: "Inventory Rate Type",
    category: "Inventory",
    description: "Rate type for inventory",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_INVENTORY_SOURCE": {
    displayName: "Inventory Source ID (Legacy)",
    reportBuilderName: "Inventory Source ID (Legacy)",
    category: "Inventory",
    description: "Legacy inventory source identifier",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_INVENTORY_SOURCES_PERMISSIONS": {
    displayName: "Inventory Sources Permissions",
    reportBuilderName: "Inventory Sources Permissions",
    category: "Inventory",
    description: "Permissions for inventory sources",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_INVENTORY_SOURCE_EXTERNAL_ID": {
    displayName: "Inventory Source ID (external)",
    reportBuilderName: "Inventory Source ID (external)",
    category: "Inventory",
    description: "External inventory source ID",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_INVENTORY_SOURCE_GROUP": {
    displayName: "Inventory Source Group",
    reportBuilderName: "Inventory Source Group",
    category: "Inventory",
    description: "Inventory source group name",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_INVENTORY_SOURCE_GROUP_ID": {
    displayName: "Inventory Source Group ID",
    reportBuilderName: "Inventory Source Group ID",
    category: "Inventory",
    description: "Inventory source group identifier",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_INVENTORY_SOURCE_ID": {
    displayName: "Inventory Source ID",
    reportBuilderName: "Inventory Source ID",
    category: "Inventory",
    description: "Inventory source identifier",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_INVENTORY_SOURCE_NAME": {
    displayName: "Inventory Source",
    reportBuilderName: "Inventory Source",
    category: "Inventory",
    description: "Inventory source name",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_INVENTORY_SOURCE_TYPE": {
    displayName: "Inventory Source Type",
    reportBuilderName: "Inventory Source Type",
    category: "Inventory",
    description: "Type of inventory source",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_IS_YOUTUBE_TV": {
    displayName: "Is YouTube TV",
    reportBuilderName: "Is YouTube TV",
    category: "YouTube",
    description: "Whether delivery was on YouTube TV",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_KEYWORD": {
    displayName: "Keyword",
    reportBuilderName: "Keyword",
    category: "Targeting",
    description: "Targeting keyword",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_LIFE_EVENTS": {
    displayName: "Life Events",
    reportBuilderName: "Life Events",
    category: "Audience",
    description: "Life event audience segments",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_LINE_ITEM": {
    displayName: "Line Item ID",
    reportBuilderName: "Line Item ID",
    category: "Entity",
    description: "Line Item identifier",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_LINE_ITEM_BUDGET": {
    displayName: "Line Item Budget",
    reportBuilderName: "Line Item Budget",
    category: "Entity",
    description: "Budget for the Line Item",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_LINE_ITEM_DAILY_FREQUENCY": {
    displayName: "Line Item Daily Frequency",
    reportBuilderName: "Line Item Daily Frequency",
    category: "Entity",
    description: "Daily frequency cap at line item level",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_LINE_ITEM_END_DATE": {
    displayName: "Line Item End Date",
    reportBuilderName: "Line Item End Date",
    category: "Entity",
    description: "End date of Line Item",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_LINE_ITEM_INTEGRATION_CODE": {
    displayName: "Line Item Integration Code",
    reportBuilderName: "Line Item Integration Code",
    category: "Entity",
    description: "Custom integration code for Line Item",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_LINE_ITEM_LIFETIME_FREQUENCY": {
    displayName: "Line Item Lifetime Frequency",
    reportBuilderName: "Line Item Lifetime Frequency",
    category: "Entity",
    description: "Lifetime frequency cap at line item level",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_LINE_ITEM_NAME": {
    displayName: "Line Item",
    reportBuilderName: "Line Item",
    category: "Entity",
    description: "Line Item name",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_LINE_ITEM_PACING_PERCENTAGE": {
    displayName: "Line Item Pacing Percentage",
    reportBuilderName: "Line Item Pacing Percentage",
    category: "Entity",
    description: "Pacing percentage for Line Item",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_LINE_ITEM_START_DATE": {
    displayName: "Line Item Start Date",
    reportBuilderName: "Line Item Start Date",
    category: "Entity",
    description: "Start date of Line Item",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_LINE_ITEM_STATUS": {
    displayName: "Line Item Status",
    reportBuilderName: "Line Item Status",
    category: "Entity",
    description: "Status of Line Item",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_LINE_ITEM_TYPE": {
    displayName: "Line Item Type",
    reportBuilderName: "Line Item Type",
    category: "Entity",
    description: "Type of Line Item",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_LOCATION_ASSET": {
    displayName: "Asset (upgraded Location)",
    reportBuilderName: "Asset (upgraded Location)",
    category: "Creative",
    description: "Location asset (upgraded)",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_LOCATION_ASSET_STATUS": {
    displayName: "Asset Status (upgraded Location)",
    reportBuilderName: "Asset Status (upgraded Location)",
    category: "Creative",
    description: "Status of location asset",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_LOCATION_ASSET_TYPE": {
    displayName: "Asset Type (upgraded Location)",
    reportBuilderName: "Asset Type (upgraded Location)",
    category: "Creative",
    description: "Type of location asset",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_MATCHED_GENRE_TARGET": {
    displayName: "Matched Genre Target",
    reportBuilderName: "Matched Genre Target",
    category: "Targeting",
    description: "Genre targeting match",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_MATCH_RATIO": {
    displayName: "Match Ratio",
    reportBuilderName: "Match Ratio",
    category: "Audience",
    description: "Audience match ratio",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_MEASUREMENT_SOURCE": {
    displayName: "Measurement Source",
    reportBuilderName: "Measurement Source",
    category: "Measurement",
    description: "Source of measurement data",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_MEDIA_PLAN": {
    displayName: "Campaign ID",
    reportBuilderName: "Campaign ID",
    category: "Entity",
    description: "Campaign (Media Plan) identifier",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_MEDIA_PLAN_NAME": {
    displayName: "Campaign",
    reportBuilderName: "Campaign",
    category: "Entity",
    description: "Campaign (Media Plan) name",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_MEDIA_TYPE": {
    displayName: "Media Type",
    reportBuilderName: "Media Type",
    category: "Inventory",
    description: "Type of media (Display, Video, Audio)",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_MOBILE_GEO": {
    displayName: "Business Chain",
    reportBuilderName: "Business Chain",
    category: "Targeting",
    description: "Mobile geo business chain",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_MONITORED_ENTITY_PRIORITIZATION_NAME": {
    displayName: "Commitment Deal Mode",
    reportBuilderName: "Commitment Deal Mode",
    category: "Inventory",
    description: "Deal mode for monitored entity",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_MONTH": {
    displayName: "Month",
    reportBuilderName: "Month",
    category: "Time",
    description: "Month dimension for monthly breakdown",
    usage: ["groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_MRAID_SUPPORT": {
    displayName: "MRAID Support",
    reportBuilderName: "MRAID Support",
    category: "Inventory",
    description: "MRAID support level",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_NIELSEN_COUNTRY_CODE": {
    displayName: "Country (Nielsen)",
    reportBuilderName: "Country",
    category: "Measurement",
    description: "Nielsen country code",
    usage: ["filter","groupBy"],
    reportTypes: ["GRP"]
  },
  "FILTER_NIELSEN_DATE_RANGE": {
    displayName: "Date Range for Cumulative Metrics",
    reportBuilderName: "Date Range for Cumulative Metrics",
    category: "Measurement",
    description: "Date range for Nielsen metrics",
    usage: ["filter","groupBy"],
    reportTypes: ["GRP"]
  },
  "FILTER_NIELSEN_DEVICE_ID": {
    displayName: "Device ID (Nielsen)",
    reportBuilderName: "Device ID",
    category: "Measurement",
    description: "Nielsen device identifier",
    usage: ["filter","groupBy"],
    reportTypes: ["GRP"]
  },
  "FILTER_OMID_CAPABLE": {
    displayName: "OM SDK Capable",
    reportBuilderName: "OM SDK Capable",
    category: "Viewability",
    description: "Whether OM SDK is capable",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_OM_SDK_AVAILABLE": {
    displayName: "OM SDK Available",
    reportBuilderName: "OM SDK Available",
    category: "Viewability",
    description: "Whether OM SDK is available",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_ORDER_ID": {
    displayName: "Order ID",
    reportBuilderName: "Order ID",
    category: "Entity",
    description: "Order identifier",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_OS": {
    displayName: "Operating System",
    reportBuilderName: "Operating System",
    category: "Targeting",
    description: "Device operating system",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_OTHER_ADVERTISER_ID": {
    displayName: "Other Advertiser ID",
    reportBuilderName: "Other Advertiser ID",
    category: "Entity",
    description: "Other advertiser identifier",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_OTHER_ADVERTISER_NAME": {
    displayName: "Other Advertiser",
    reportBuilderName: "Other Advertiser",
    category: "Entity",
    description: "Other advertiser name",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_OTHER_CAMPAIGN_ID": {
    displayName: "Other Insertion Order ID",
    reportBuilderName: "Other Insertion Order ID",
    category: "Entity",
    description: "Other Insertion Order identifier",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_OTHER_CAMPAIGN_NAME": {
    displayName: "Other Insertion Order",
    reportBuilderName: "Other Insertion Order",
    category: "Entity",
    description: "Other Insertion Order name",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_OTHER_DEVICE_TYPE": {
    displayName: "Other Device Type",
    reportBuilderName: "Other Device Type",
    category: "Targeting",
    description: "Other device type",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_PAGE_CATEGORY": {
    displayName: "Category",
    reportBuilderName: "Category",
    category: "Inventory",
    description: "Page category",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_PAGE_LAYOUT": {
    displayName: "Environment",
    reportBuilderName: "Environment",
    category: "Inventory",
    description: "Page layout environment",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_PARTNER": {
    displayName: "Partner ID",
    reportBuilderName: "Partner ID",
    category: "Entity",
    description: "DV360 Partner identifier",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_PARTNER_CURRENCY": {
    displayName: "Partner Currency",
    reportBuilderName: "Partner Currency",
    category: "Entity",
    description: "Currency for the partner",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_PARTNER_NAME": {
    displayName: "Partner",
    reportBuilderName: "Partner",
    category: "Entity",
    description: "Partner name",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_PARTNER_STATUS": {
    displayName: "Partner Status",
    reportBuilderName: "Partner Status",
    category: "Entity",
    description: "Status of the partner",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_PLACEMENT_ALL_YOUTUBE_CHANNELS": {
    displayName: "Placement (All YouTube Channels)",
    reportBuilderName: "Placement (All YouTube Channels)",
    category: "YouTube",
    description: "All YouTube channel placements",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_PLACEMENT_NAME_ALL_YOUTUBE_CHANNELS": {
    displayName: "Placement Name (All YouTube Channels)",
    reportBuilderName: "Placement Name (All YouTube Channels)",
    category: "YouTube",
    description: "Names of all YouTube channel placements",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_PLATFORM": {
    displayName: "Platform",
    reportBuilderName: "Platform",
    category: "Targeting",
    description: "Platform type",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_PLAYBACK_METHOD": {
    displayName: "Playback Method",
    reportBuilderName: "Playback Method",
    category: "Video",
    description: "Video playback method",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_POSITION_IN_CONTENT": {
    displayName: "Position in Content",
    reportBuilderName: "Position in Content",
    category: "Video",
    description: "Video position in content",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_PUBLIC_INVENTORY": {
    displayName: "Public Inventory",
    reportBuilderName: "Public Inventory",
    category: "Inventory",
    description: "Whether inventory is public",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_PUBLISHER_TRAFFIC_SOURCE": {
    displayName: "Publisher Traffic Source",
    reportBuilderName: "Publisher Traffic Source",
    category: "Inventory",
    description: "Source of publisher traffic",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_QUARTER": {
    displayName: "Quarter",
    reportBuilderName: "Quarter",
    category: "Time",
    description: "Quarter dimension for quarterly breakdown",
    usage: ["groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_REFRESHED_AD_NAME": {
    displayName: "Refreshed Ad",
    reportBuilderName: "Refreshed Ad",
    category: "Inventory",
    description: "Name of refreshed ad",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_REFUND_REASON": {
    displayName: "Refund Reason",
    reportBuilderName: "Refund Reason",
    category: "Cost",
    description: "Reason for refund",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_REGION": {
    displayName: "Region ID",
    reportBuilderName: "Region ID",
    category: "Targeting",
    description: "Region/state identifier",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_REGION_NAME": {
    displayName: "Region",
    reportBuilderName: "Region",
    category: "Targeting",
    description: "Region/state name",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_REWARDED": {
    displayName: "Rewarded",
    reportBuilderName: "Rewarded",
    category: "Inventory",
    description: "Whether ad is rewarded",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_SENSITIVE_CATEGORY": {
    displayName: "Sensitive Category",
    reportBuilderName: "Sensitive Category",
    category: "Inventory",
    description: "Sensitive content category",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_SERVED_PIXEL_DENSITY": {
    displayName: "Served Pixel Density",
    reportBuilderName: "Served Pixel Density",
    category: "Creative",
    description: "Pixel density of served creative",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_SITE_ID": {
    displayName: "App/URL ID",
    reportBuilderName: "App/URL ID",
    category: "Inventory",
    description: "Site or app identifier",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_SITE_LANGUAGE": {
    displayName: "Language",
    reportBuilderName: "Language",
    category: "Inventory",
    description: "Site language",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_SKIPPABLE_SUPPORT": {
    displayName: "Video Skippable Support",
    reportBuilderName: "Video Skippable Support",
    category: "Video",
    description: "Whether video supports skipping",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_SUBDOMAIN": {
    displayName: "Subdomain",
    reportBuilderName: "Subdomain",
    category: "Inventory",
    description: "Website subdomain",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_TARGETED_DATA_PROVIDERS": {
    displayName: "Targeted Data Providers",
    reportBuilderName: "Targeted Data Providers",
    category: "Audience",
    description: "Data providers used for targeting",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_TARGETED_LOCATION_DIMENSION_STRING": {
    displayName: "Targeted location",
    reportBuilderName: "Targeted location",
    category: "Targeting",
    description: "Targeted location string",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_TARGETED_USER_LIST": {
    displayName: "Attributed Userlist ID",
    reportBuilderName: "Attributed Userlist ID",
    category: "Audience",
    description: "ID of targeted user list",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_TARGETING_EXPANSION": {
    displayName: "Optimized Targeting",
    reportBuilderName: "Optimized Targeting",
    category: "Targeting",
    description: "Whether optimized targeting is enabled",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_THIRD_PARTY_AUDIENCE_LIST_COST": {
    displayName: "Third Party Audience List Cost",
    reportBuilderName: "Third Party Audience List Cost",
    category: "Audience",
    description: "Cost of third-party audience list",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_THIRD_PARTY_AUDIENCE_LIST_TYPE": {
    displayName: "Third Party Audience List Type",
    reportBuilderName: "Third Party Audience List Type",
    category: "Audience",
    description: "Type of third-party audience list",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_TIME_OF_DAY": {
    displayName: "Time of Day",
    reportBuilderName: "Time of Day",
    category: "Time",
    description: "Hour of day dimension",
    usage: ["groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_TRUEVIEW_AD": {
    displayName: "YouTube Ad",
    reportBuilderName: "YouTube Ad",
    category: "YouTube",
    description: "YouTube TrueView ad name",
    usage: ["filter","groupBy"],
    reportTypes: ["YOUTUBE"]
  },
  "FILTER_TRUEVIEW_AD_FORMAT": {
    displayName: "YouTube Ad Format",
    reportBuilderName: "YouTube Ad Format",
    category: "YouTube",
    description: "Format of YouTube ad",
    usage: ["filter","groupBy"],
    reportTypes: ["YOUTUBE"]
  },
  "FILTER_TRUEVIEW_AD_GROUP": {
    displayName: "YouTube Ad Group",
    reportBuilderName: "YouTube Ad Group",
    category: "YouTube",
    description: "YouTube ad group name",
    usage: ["filter","groupBy"],
    reportTypes: ["YOUTUBE"]
  },
  "FILTER_TRUEVIEW_AD_GROUP_AD_ID": {
    displayName: "YouTube Ad ID",
    reportBuilderName: "YouTube Ad ID",
    category: "YouTube",
    description: "YouTube ad identifier",
    usage: ["filter","groupBy"],
    reportTypes: ["YOUTUBE"]
  },
  "FILTER_TRUEVIEW_AD_GROUP_ID": {
    displayName: "YouTube Ad Group ID",
    reportBuilderName: "YouTube Ad Group ID",
    category: "YouTube",
    description: "YouTube ad group identifier",
    usage: ["filter","groupBy"],
    reportTypes: ["YOUTUBE"]
  },
  "FILTER_TRUEVIEW_AD_TYPE_NAME": {
    displayName: "YouTube Ad Type",
    reportBuilderName: "YouTube Ad Type",
    category: "YouTube",
    description: "Type of YouTube ad",
    usage: ["filter","groupBy"],
    reportTypes: ["YOUTUBE"]
  },
  "FILTER_TRUEVIEW_AGE": {
    displayName: "Age (YouTube)",
    reportBuilderName: "Age (YouTube)",
    category: "YouTube",
    description: "Age demographic for YouTube",
    usage: ["filter","groupBy"],
    reportTypes: ["YOUTUBE"]
  },
  "FILTER_TRUEVIEW_AUDIENCE_SEGMENT": {
    displayName: "Audience Segment",
    reportBuilderName: "Audience Segment",
    category: "YouTube",
    description: "YouTube audience segment",
    usage: ["filter","groupBy"],
    reportTypes: ["YOUTUBE"]
  },
  "FILTER_TRUEVIEW_AUDIENCE_SEGMENT_TYPE": {
    displayName: "Audience Segment Type",
    reportBuilderName: "Audience Segment Type",
    category: "YouTube",
    description: "Type of YouTube audience segment",
    usage: ["filter","groupBy"],
    reportTypes: ["YOUTUBE"]
  },
  "FILTER_TRUEVIEW_CATEGORY": {
    displayName: "Category (YouTube)",
    reportBuilderName: "Category (YouTube)",
    category: "YouTube",
    description: "YouTube content category",
    usage: ["filter","groupBy"],
    reportTypes: ["YOUTUBE"]
  },
  "FILTER_TRUEVIEW_CITY": {
    displayName: "City (YouTube)",
    reportBuilderName: "City (YouTube)",
    category: "YouTube",
    description: "City for YouTube targeting",
    usage: ["filter","groupBy"],
    reportTypes: ["YOUTUBE"]
  },
  "FILTER_TRUEVIEW_CLICK_TYPE_NAME": {
    displayName: "Click Type",
    reportBuilderName: "Click Type",
    category: "YouTube",
    description: "Type of YouTube click",
    usage: ["filter","groupBy"],
    reportTypes: ["YOUTUBE"]
  },
  "FILTER_TRUEVIEW_CONTENT_SUITABILITY_DETAIL_NAME": {
    displayName: "Content suitability placement name (details)",
    reportBuilderName: "Content suitability placement name (details)",
    category: "YouTube",
    description: "Detailed content suitability placement",
    usage: ["filter","groupBy"],
    reportTypes: ["YOUTUBE"]
  },
  "FILTER_TRUEVIEW_CONTENT_SUITABILITY_DETAIL_TYPE_NAME": {
    displayName: "Content suitability placement type",
    reportBuilderName: "Content suitability placement type",
    category: "YouTube",
    description: "Type of content suitability placement",
    usage: ["filter","groupBy"],
    reportTypes: ["YOUTUBE"]
  },
  "FILTER_TRUEVIEW_CONTENT_SUITABILITY_GROUP_NAME": {
    displayName: "Content suitability placement name (group)",
    reportBuilderName: "Content suitability placement name (group)",
    category: "YouTube",
    description: "Group content suitability placement",
    usage: ["filter","groupBy"],
    reportTypes: ["YOUTUBE"]
  },
  "FILTER_TRUEVIEW_CONVERSION_TYPE": {
    displayName: "Conversion Type",
    reportBuilderName: "Conversion Type",
    category: "YouTube",
    description: "Type of YouTube conversion",
    usage: ["filter","groupBy"],
    reportTypes: ["YOUTUBE"]
  },
  "FILTER_TRUEVIEW_COUNTRY": {
    displayName: "Country (YouTube)",
    reportBuilderName: "Country (YouTube)",
    category: "YouTube",
    description: "Country for YouTube targeting",
    usage: ["filter","groupBy"],
    reportTypes: ["YOUTUBE"]
  },
  "FILTER_TRUEVIEW_CUSTOM_AFFINITY": {
    displayName: "Custom Affinity",
    reportBuilderName: "Custom Affinity",
    category: "YouTube",
    description: "YouTube custom affinity audience",
    usage: ["filter","groupBy"],
    reportTypes: ["YOUTUBE"]
  },
  "FILTER_TRUEVIEW_DETAILED_DEMOGRAPHICS": {
    displayName: "Detailed Demographics",
    reportBuilderName: "Detailed Demographics",
    category: "YouTube",
    description: "Detailed demographic segments",
    usage: ["filter","groupBy"],
    reportTypes: ["YOUTUBE"]
  },
  "FILTER_TRUEVIEW_DETAILED_DEMOGRAPHICS_ID": {
    displayName: "Detailed Demographics ID",
    reportBuilderName: "Detailed Demographics ID",
    category: "YouTube",
    description: "ID of detailed demographics",
    usage: ["filter","groupBy"],
    reportTypes: ["YOUTUBE"]
  },
  "FILTER_TRUEVIEW_DMA": {
    displayName: "DMA Code (YouTube)",
    reportBuilderName: "DMA Code (YouTube)",
    category: "YouTube",
    description: "DMA code for YouTube targeting",
    usage: ["filter","groupBy"],
    reportTypes: ["YOUTUBE"]
  },
  "FILTER_TRUEVIEW_DMA_NAME": {
    displayName: "DMA (YouTube)",
    reportBuilderName: "DMA (YouTube)",
    category: "YouTube",
    description: "DMA name for YouTube targeting",
    usage: ["filter","groupBy"],
    reportTypes: ["YOUTUBE"]
  },
  "FILTER_TRUEVIEW_GENDER": {
    displayName: "Gender (YouTube)",
    reportBuilderName: "Gender (YouTube)",
    category: "YouTube",
    description: "Gender for YouTube targeting",
    usage: ["filter","groupBy"],
    reportTypes: ["YOUTUBE"]
  },
  "FILTER_TRUEVIEW_HOUSEHOLD_INCOME": {
    displayName: "Household Income",
    reportBuilderName: "Household Income",
    category: "YouTube",
    description: "Household income level for YouTube",
    usage: ["filter","groupBy"],
    reportTypes: ["YOUTUBE"]
  },
  "FILTER_TRUEVIEW_INTEREST": {
    displayName: "Interest",
    reportBuilderName: "Interest",
    category: "YouTube",
    description: "YouTube interest category",
    usage: ["filter","groupBy"],
    reportTypes: ["YOUTUBE"]
  },
  "FILTER_TRUEVIEW_KEYWORD": {
    displayName: "Keyword (YouTube)",
    reportBuilderName: "Keyword (YouTube)",
    category: "YouTube",
    description: "YouTube targeting keyword",
    usage: ["filter","groupBy"],
    reportTypes: ["YOUTUBE"]
  },
  "FILTER_TRUEVIEW_PARENTAL_STATUS": {
    displayName: "Parental Status",
    reportBuilderName: "Parental Status",
    category: "YouTube",
    description: "Parental status for YouTube",
    usage: ["filter","groupBy"],
    reportTypes: ["YOUTUBE"]
  },
  "FILTER_TRUEVIEW_PLACEMENT": {
    displayName: "Placement (Managed)",
    reportBuilderName: "Placement (Managed)",
    category: "YouTube",
    description: "Managed placement for YouTube",
    usage: ["filter","groupBy"],
    reportTypes: ["YOUTUBE"]
  },
  "FILTER_TRUEVIEW_PLACEMENT_ID": {
    displayName: "Placement ID (Managed)",
    reportBuilderName: "Placement ID (Managed)",
    category: "YouTube",
    description: "ID of managed placement",
    usage: ["filter","groupBy"],
    reportTypes: ["YOUTUBE"]
  },
  "FILTER_TRUEVIEW_REGION": {
    displayName: "Region ID (YouTube)",
    reportBuilderName: "Region ID (YouTube)",
    category: "YouTube",
    description: "Region ID for YouTube targeting",
    usage: ["filter","groupBy"],
    reportTypes: ["YOUTUBE"]
  },
  "FILTER_TRUEVIEW_REGION_NAME": {
    displayName: "Region (YouTube)",
    reportBuilderName: "Region (YouTube)",
    category: "YouTube",
    description: "Region name for YouTube targeting",
    usage: ["filter","groupBy"],
    reportTypes: ["YOUTUBE"]
  },
  "FILTER_TRUEVIEW_REMARKETING_LIST": {
    displayName: "Remarketing List ID",
    reportBuilderName: "Remarketing List ID",
    category: "YouTube",
    description: "YouTube remarketing list ID",
    usage: ["filter","groupBy"],
    reportTypes: ["YOUTUBE"]
  },
  "FILTER_TRUEVIEW_REMARKETING_LIST_NAME": {
    displayName: "Remarketing List",
    reportBuilderName: "Remarketing List",
    category: "YouTube",
    description: "YouTube remarketing list name",
    usage: ["filter","groupBy"],
    reportTypes: ["YOUTUBE"]
  },
  "FILTER_TRUEVIEW_TARGETING_EXPANSION": {
    displayName: "Optimized Targeting (YouTube)",
    reportBuilderName: "Optimized Targeting",
    category: "YouTube",
    description: "YouTube optimized targeting",
    usage: ["filter","groupBy"],
    reportTypes: ["YOUTUBE"]
  },
  "FILTER_TRUEVIEW_URL": {
    displayName: "Placement (All)",
    reportBuilderName: "Placement (All)",
    category: "YouTube",
    description: "All YouTube placements",
    usage: ["filter","groupBy"],
    reportTypes: ["YOUTUBE"]
  },
  "FILTER_TRUEVIEW_ZIPCODE": {
    displayName: "Zip Code (YouTube)",
    reportBuilderName: "Zip Code (YouTube)",
    category: "YouTube",
    description: "Zip code for YouTube targeting",
    usage: ["filter","groupBy"],
    reportTypes: ["YOUTUBE"]
  },
  "FILTER_UNIQUE_REACH_SAMPLE_SIZE_ID": {
    displayName: "Unique Reach Sample Size",
    reportBuilderName: "Unique Reach Sample Size",
    category: "Reach",
    description: "Sample size for unique reach",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_USER_LIST": {
    displayName: "Audience List ID",
    reportBuilderName: "Audience List ID",
    category: "Audience",
    description: "Audience list identifier",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_USER_LIST_FIRST_PARTY": {
    displayName: "First Party Audience List ID",
    reportBuilderName: "First Party Audience List ID",
    category: "Audience",
    description: "First-party audience list ID",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_USER_LIST_FIRST_PARTY_NAME": {
    displayName: "First Party Audience List",
    reportBuilderName: "First Party Audience List",
    category: "Audience",
    description: "First-party audience list name",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_USER_LIST_THIRD_PARTY": {
    displayName: "Third Party Audience List ID",
    reportBuilderName: "Third Party Audience List ID",
    category: "Audience",
    description: "Third-party audience list ID",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_USER_LIST_THIRD_PARTY_NAME": {
    displayName: "Third Party Audience List",
    reportBuilderName: "Third Party Audience List",
    category: "Audience",
    description: "Third-party audience list name",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_UTC_DATE": {
    displayName: "Date (UTC)",
    reportBuilderName: "Date (UTC)",
    category: "Time",
    description: "Date in UTC timezone",
    usage: ["groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_VARIANT_ID": {
    displayName: "Variant ID",
    reportBuilderName: "Variant ID",
    category: "Creative",
    description: "Creative variant identifier",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_VARIANT_NAME": {
    displayName: "Variant Name",
    reportBuilderName: "Variant Name",
    category: "Creative",
    description: "Creative variant name",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_VARIANT_VERSION": {
    displayName: "Variant Version",
    reportBuilderName: "Variant Version",
    category: "Creative",
    description: "Creative variant version",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_VENDOR_MEASUREMENT_MODE": {
    displayName: "Vendor Measurement Mode",
    reportBuilderName: "Vendor Measurement Mode",
    category: "Measurement",
    description: "Measurement mode for vendor",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_VERIFICATION_AUDIBILITY_COMPLETE": {
    displayName: "Audibility At Complete",
    reportBuilderName: "Audibility At Complete",
    category: "Viewability",
    description: "Audio audibility at completion",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_VERIFICATION_AUDIBILITY_START": {
    displayName: "Audibility At Start",
    reportBuilderName: "Audibility At Start",
    category: "Viewability",
    description: "Audio audibility at start",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_VERIFICATION_VIDEO_PLAYER_SIZE": {
    displayName: "Verification Video Player Size",
    reportBuilderName: "Verification Video Player Size",
    category: "Viewability",
    description: "Video player size for verification",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_VERIFICATION_VIDEO_PLAYER_SIZE_COMPLETE": {
    displayName: "Video Player Size at Completion",
    reportBuilderName: "Video Player Size at Completion",
    category: "Viewability",
    description: "Player size at video completion",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_VERIFICATION_VIDEO_PLAYER_SIZE_FIRST_QUARTILE": {
    displayName: "Video Player Size at First Quartile",
    reportBuilderName: "Video Player Size at First Quartile",
    category: "Viewability",
    description: "Player size at first quartile",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_VERIFICATION_VIDEO_PLAYER_SIZE_MID_POINT": {
    displayName: "Video Player Size at Midpoint",
    reportBuilderName: "Video Player Size at Midpoint",
    category: "Viewability",
    description: "Player size at midpoint",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_VERIFICATION_VIDEO_PLAYER_SIZE_START": {
    displayName: "Video Player Size at Start",
    reportBuilderName: "Video Player Size at Start",
    category: "Viewability",
    description: "Player size at video start",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_VERIFICATION_VIDEO_PLAYER_SIZE_THIRD_QUARTILE": {
    displayName: "Video Player Size at Third Quartile",
    reportBuilderName: "Video Player Size at Third Quartile",
    category: "Viewability",
    description: "Player size at third quartile",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_VERIFICATION_VIDEO_POSITION": {
    displayName: "Verification Video Position",
    reportBuilderName: "Verification Video Position",
    category: "Viewability",
    description: "Video position for verification",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_VERIFICATION_VIDEO_RESIZED": {
    displayName: "Video Resized",
    reportBuilderName: "Video Resized",
    category: "Viewability",
    description: "Whether video was resized",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_VIDEO_AD_POSITION_IN_STREAM": {
    displayName: "Video Ad Position In Stream",
    reportBuilderName: "Video Ad Position In Stream",
    category: "Video",
    description: "Position of video ad in stream",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_VIDEO_COMPANION_CREATIVE_SIZE": {
    displayName: "Companion Creative Size",
    reportBuilderName: "Companion Creative Size",
    category: "Video",
    description: "Size of companion creative",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_VIDEO_CONTENT_DURATION": {
    displayName: "Video Content Duration",
    reportBuilderName: "Video Content Duration",
    category: "Video",
    description: "Duration of video content",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_VIDEO_CONTENT_LIVE_STREAM": {
    displayName: "Video Content Live Stream",
    reportBuilderName: "Video Content Live Stream",
    category: "Video",
    description: "Whether content is live stream",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_VIDEO_CONTINUOUS_PLAY": {
    displayName: "Video Continuous Play",
    reportBuilderName: "Video Continuous Play",
    category: "Video",
    description: "Whether video plays continuously",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_VIDEO_CREATIVE_DURATION": {
    displayName: "Video Creative Duration",
    reportBuilderName: "Video Creative Duration",
    category: "Video",
    description: "Duration of video creative",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_VIDEO_CREATIVE_DURATION_SKIPPABLE": {
    displayName: "Video Creative Duration (Skippable)",
    reportBuilderName: "Video Creative Duration (Skippable)",
    category: "Video",
    description: "Skippable video creative duration",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_VIDEO_DURATION": {
    displayName: "Video Duration",
    reportBuilderName: "Video Duration",
    category: "Video",
    description: "Duration of video",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_VIDEO_DURATION_SECONDS": {
    displayName: "Max Video Duration",
    reportBuilderName: "Max Video Duration",
    category: "Video",
    description: "Maximum video duration in seconds",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_VIDEO_DURATION_SECONDS_RANGE": {
    displayName: "Max Video Duration Range",
    reportBuilderName: "Max Video Duration Range",
    category: "Video",
    description: "Range of max video duration",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_VIDEO_FORMAT_SUPPORT": {
    displayName: "Video Format Support",
    reportBuilderName: "Video Format Support",
    category: "Video",
    description: "Supported video formats",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_VIDEO_PLAYER_SIZE": {
    displayName: "Video Player Size",
    reportBuilderName: "Video Player Size",
    category: "Video",
    description: "Size of video player",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_VIDEO_RATING_TIER": {
    displayName: "Digital Content Label (Video)",
    reportBuilderName: "Digital Content Label",
    category: "Video",
    description: "Content rating tier for video",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_VIDEO_SKIPPABLE_SUPPORT": {
    displayName: "Video Skippable Support",
    reportBuilderName: "Video Skippable Support",
    category: "Video",
    description: "Skippable support level",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_WEEK": {
    displayName: "Week",
    reportBuilderName: "Week",
    category: "Time",
    description: "Week dimension for weekly breakdown",
    usage: ["groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_YEAR": {
    displayName: "Year",
    reportBuilderName: "Year",
    category: "Time",
    description: "Year dimension",
    usage: ["groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_YOUTUBE_AD_VIDEO": {
    displayName: "YouTube Ad Video",
    reportBuilderName: "YouTube Ad Video",
    category: "YouTube",
    description: "YouTube ad video name",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_YOUTUBE_AD_VIDEO_ID": {
    displayName: "YouTube Ad Video ID",
    reportBuilderName: "YouTube Ad Video ID",
    category: "YouTube",
    description: "YouTube ad video identifier",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_YOUTUBE_PROGRAMMATIC_GUARANTEED_ADVERTISER": {
    displayName: "Advertiser (YouTube PG)",
    reportBuilderName: "Advertiser",
    category: "YouTube",
    description: "Advertiser for YouTube PG",
    usage: ["filter","groupBy"],
    reportTypes: ["YOUTUBE_PROGRAMMATIC_GUARANTEED"]
  },
  "FILTER_ZIP_CODE": {
    displayName: "Zip Code ID",
    reportBuilderName: "Zip Code ID",
    category: "Targeting",
    description: "Zip code identifier",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  },
  "FILTER_ZIP_POSTAL_CODE": {
    displayName: "Zip Code",
    reportBuilderName: "Zip Code",
    category: "Targeting",
    description: "Zip/postal code",
    usage: ["filter","groupBy"],
    reportTypes: ["STANDARD","FLOODLIGHT","AUDIENCE_COMPOSITION"]
  }
};

/**
 * Available filter categories
 */
export const FILTER_CATEGORIES = [
  "Time",
  "Entity",
  "Targeting",
  "Audience",
  "Inventory",
  "Video",
  "Creative",
  "Conversion",
  "Viewability",
  "YouTube",
  "Audio",
  "Bidding",
  "Budget",
  "Commerce",
  "Cost",
  "Delivery",
  "Measurement",
  "Reach"
] as const;

export type FilterCategory = (typeof FILTER_CATEGORIES)[number];

/**
 * Get all filters in a specific category
 */
export function getFiltersByCategory(category: FilterCategory): FilterType[] {
  return (Object.entries(FILTER_METADATA) as [FilterType, FilterMetadata][])
    .filter(([_, meta]) => meta.category === category)
    .map(([name]) => name);
}

/**
 * Get filters that can be used as groupBys
 */
export function getGroupByFilters(): FilterType[] {
  return (Object.entries(FILTER_METADATA) as [FilterType, FilterMetadata][])
    .filter(([_, meta]) => meta.usage.includes("groupBy"))
    .map(([name]) => name);
}

/**
 * Check if a string is a valid filter type
 */
export function isValidFilterType(value: string): value is FilterType {
  return FilterTypeSchema.safeParse(value).success;
}
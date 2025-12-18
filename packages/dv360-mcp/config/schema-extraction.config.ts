/**
 * OpenAPI Schema Extraction Configuration - Phase 1 (MVP)
 *
 * This is a simplified configuration focused on proving the core extraction
 * concept. Advanced features (operation discovery, usage tracing, resource scopes)
 * are deferred to Phase 2.
 *
 * @see ../../docs/openapi-schema-extraction-spec.md for full specification
 */

import { z } from 'zod';

/**
 * Phase 1: Simplified configuration schema
 *
 * Includes only essential fields needed for basic extraction.
 * All optional fields use sensible defaults.
 */
export const SchemaExtractionConfigSchema = z.object({
  /**
   * API version to target (e.g., 'v3', 'v4')
   */
  apiVersion: z.string(),

  /**
   * Root schemas to extract. All dependencies will be auto-resolved.
   *
   * @example ['InsertionOrder', 'LineItem', 'AdGroup']
   */
  rootSchemas: z.array(z.string()).min(1, 'At least one root schema is required'),

  /**
   * Automatically include common primitive types (Date, Money, Status, etc.)
   * @default true
   */
  includeCommonTypes: z.boolean().default(true),

  /**
   * Glob patterns for schemas to exclude from extraction
   * @example ['*Deprecated*', 'Internal*', '*Test*']
   */
  excludePatterns: z.array(z.string()).optional(),

  /**
   * Dependency resolution configuration
   */
  resolution: z.object({
    /**
     * Follow $ref links to include all dependencies
     * @default true
     */
    resolveDependencies: z.boolean().default(true),

    /**
     * Maximum depth for dependency resolution (prevents infinite recursion)
     * @default 10
     */
    maxDepth: z.number().int().min(1).max(50).default(10),

    /**
     * Include enum definitions referenced by schemas
     * @default true
     */
    includeEnums: z.boolean().default(true),
  }).default({}),

  /**
   * Output configuration
   */
  output: z.object({
    /**
     * Path to save the extracted minimal OpenAPI spec (relative to package root)
     * @default '.tmp-specs/minimal-openapi.yaml'
     */
    specPath: z.string().default('.tmp-specs/dv360-minimal-v4.yaml'),

    /**
     * Path to generate TypeScript/Zod schemas (relative to package root)
     * @default 'src/generated/schemas'
     */
    generatedPath: z.string().default('src/generated/schemas'),

    /**
     * Generate a detailed extraction report
     * @default true
     */
    generateReport: z.boolean().default(true),

    /**
     * Path to save the extraction report (relative to package root)
     * @default '.tmp-specs/extraction-report.json'
     */
    reportPath: z.string().default('.tmp-specs/extraction-report.json'),

    /**
     * Pretty-print JSON outputs
     * @default true
     */
    prettyPrint: z.boolean().default(true),
  }).default({}),

  /**
   * Discovery Document configuration
   */
  discovery: z.object({
    /**
     * Base URL for Google Discovery API
     * @default 'https://displayvideo.googleapis.com/$discovery/rest'
     */
    baseUrl: z.string().url().default('https://displayvideo.googleapis.com/$discovery/rest'),

    /**
     * Timeout for fetching discovery document (milliseconds)
     * @default 30000
     */
    timeout: z.number().int().min(1000).default(30000),

    /**
     * Cache discovery document locally to avoid repeated fetches
     * @default true
     */
    enableCache: z.boolean().default(true),

    /**
     * Cache TTL in milliseconds
     * Development: 1 hour, Production: 24 hours
     * @default 3600000 (1 hour)
     */
    cacheTTL: z.number().int().min(0).default(
      process.env.NODE_ENV === 'production' ? 86400000 : 3600000
    ),
  }).default({}),

  /**
   * Validation configuration
   */
  validation: z.object({
    /**
     * Fail extraction if circular references are detected
     * Phase 1: Fail by default until we validate code generators handle them
     * @default true
     */
    failOnCircularRefs: z.boolean().default(true),

    /**
     * Fail extraction if any root schema is not found
     * @default true
     */
    failOnMissingSchemas: z.boolean().default(true),

    /**
     * Warn if extracted spec exceeds size threshold (bytes)
     * Phase 1: Set to null to skip until we have baseline measurements
     * @default null
     */
    warnOnSizeThreshold: z.number().int().min(0).nullable().default(null),

    /**
     * Fail if extracted spec exceeds hard size limit (bytes)
     * Phase 1: Set to null to skip until we have baseline measurements
     * @default null
     */
    failOnSizeLimit: z.number().int().min(0).nullable().default(null),
  }).default({}),
});

export type SchemaExtractionConfig = z.infer<typeof SchemaExtractionConfigSchema>;

/**
 * Phase 1 Configuration: DV360 v4 Core Entities
 *
 * This configuration extracts only the most critical entities used by the
 * DV360 MCP server. Additional entities can be added incrementally as needed.
 *
 * Current focus areas:
 * - Campaign hierarchy (Partner → Advertiser → Campaign → InsertionOrder → LineItem → AdGroup → AdGroupAd)
 * - Creative management
 * - List response wrappers for pagination
 * - Budget and pacing structures
 */
export const SCHEMA_EXTRACTION_CONFIG: SchemaExtractionConfig = {
  apiVersion: 'v4',

  // Phase 1: Core entities only
  // Start small to validate the pipeline works correctly
  rootSchemas: [
    // Core entities (primary hierarchy)
    // Partner → Advertiser → Campaign → InsertionOrder → LineItem → AdGroup → AdGroupAd
    'Partner',
    'Advertiser',
    'Campaign',
    'InsertionOrder',
    'LineItem',
    'AdGroup',
    'AdGroupAd',
    'Creative',

    // Top-level resources
    'CustomBiddingAlgorithm',

    // Response wrappers (for list operations)
    'ListPartnersResponse',
    'ListAdvertisersResponse',
    'ListCampaignsResponse',
    'ListInsertionOrdersResponse',
    'ListLineItemsResponse',
    'ListAdGroupsResponse',
    'ListAdGroupAdsResponse',
    'ListCreativesResponse',
    'ListCustomBiddingAlgorithmsResponse',

    // Critical nested types
    // Note: These will be auto-resolved via dependencies, but we list them
    // explicitly to ensure they're included even if refs are missed
    'InsertionOrderBudget',
    'Pacing',
    'FrequencyCap',
    'BiddingStrategy',

    // ========================================
    // Phase 2: Targeting Configuration Support
    // ========================================

    // Core targeting schemas
    'AssignedTargetingOption',
    'ListInsertionOrderAssignedTargetingOptionsResponse',
    'ListLineItemAssignedTargetingOptionsResponse',
    'ListAdGroupAssignedTargetingOptionsResponse',

    // Content & Audience targeting details
    'ChannelAssignedTargetingOptionDetails',
    'AppCategoryAssignedTargetingOptionDetails',
    'AppAssignedTargetingOptionDetails',
    'UrlAssignedTargetingOptionDetails',
    'AgeRangeAssignedTargetingOptionDetails',
    'GenderAssignedTargetingOptionDetails',
    'ParentalStatusAssignedTargetingOptionDetails',
    'HouseholdIncomeAssignedTargetingOptionDetails',
    'AudienceGroupAssignedTargetingOptionDetails',

    // Location targeting details
    'RegionalLocationListAssignedTargetingOptionDetails',
    'ProximityLocationListAssignedTargetingOptionDetails',
    'GeoRegionAssignedTargetingOptionDetails',
    'PoiAssignedTargetingOptionDetails',
    'BusinessChainAssignedTargetingOptionDetails',

    // Device & Environment targeting details
    'DeviceTypeAssignedTargetingOptionDetails',
    'BrowserAssignedTargetingOptionDetails',
    'OperatingSystemAssignedTargetingOptionDetails',
    'DeviceMakeModelAssignedTargetingOptionDetails',
    'CarrierAndIspAssignedTargetingOptionDetails',
    'EnvironmentAssignedTargetingOptionDetails',
    'OmidAssignedTargetingOptionDetails',

    // Video & Media targeting details
    'VideoPlayerSizeAssignedTargetingOptionDetails',
    'UserRewardedContentAssignedTargetingOptionDetails',
    'ContentInstreamPositionAssignedTargetingOptionDetails',
    'ContentOutstreamPositionAssignedTargetingOptionDetails',
    'ContentDurationAssignedTargetingOptionDetails',
    'ContentStreamTypeAssignedTargetingOptionDetails',
    'AudioContentTypeAssignedTargetingOptionDetails',
    'ContentGenreAssignedTargetingOptionDetails',
    'NativeContentPositionAssignedTargetingOptionDetails',

    // Inventory targeting details
    'InventorySourceAssignedTargetingOptionDetails',
    'InventorySourceGroupAssignedTargetingOptionDetails',
    'ExchangeAssignedTargetingOptionDetails',
    'SubExchangeAssignedTargetingOptionDetails',

    // Keywords & Exclusions targeting details
    'KeywordAssignedTargetingOptionDetails',
    'NegativeKeywordListAssignedTargetingOptionDetails',
    'DigitalContentLabelAssignedTargetingOptionDetails',
    'SensitiveCategoryAssignedTargetingOptionDetails',
    'ContentThemeAssignedTargetingOptionDetails',

    // Other targeting details
    'DayAndTimeAssignedTargetingOptionDetails',
    'ViewabilityAssignedTargetingOptionDetails',
    'CategoryAssignedTargetingOptionDetails',
    'LanguageAssignedTargetingOptionDetails',
    'AuthorizedSellerStatusAssignedTargetingOptionDetails',
    'YoutubeVideoAssignedTargetingOptionDetails',
    'YoutubeChannelAssignedTargetingOptionDetails',
    'SessionPositionAssignedTargetingOptionDetails',
    'OnScreenPositionAssignedTargetingOptionDetails',
    'ThirdPartyVerifierAssignedTargetingOptionDetails',
  ],

  includeCommonTypes: true,

  // Phase 1: Minimal exclusions
  // Only exclude obviously deprecated/internal schemas
  excludePatterns: [
    '*Deprecated*',
    'Internal*',
    '*TestOnly*',
  ],

  resolution: {
    resolveDependencies: true,
    maxDepth: 10,
    includeEnums: true,
  },

  output: {
    specPath: '.tmp-specs/dv360-minimal-v4.yaml',
    generatedPath: 'src/generated/schemas',
    generateReport: true,
    reportPath: '.tmp-specs/extraction-report.json',
    prettyPrint: true,
  },

  discovery: {
    baseUrl: 'https://displayvideo.googleapis.com/$discovery/rest',
    timeout: 30000,
    enableCache: true,
    cacheTTL: process.env.NODE_ENV === 'production' ? 86400000 : 3600000,
  },

  validation: {
    failOnCircularRefs: true,
    failOnMissingSchemas: true,
    // Phase 1: Skip size validation until we have baseline measurements
    warnOnSizeThreshold: null,
    failOnSizeLimit: null,
  },
};

/**
 * Phase 2+ Features (Not Yet Implemented)
 *
 * The following features are documented in the spec but deferred to later phases:
 *
 * 1. Operation-based extraction:
 *    operations: ['advertisers.list', 'advertisers.insertionOrders.patch', ...]
 *
 * 2. Resource scope discovery:
 *    resourceScopes: ['advertisers', 'advertisers.insertionOrders', ...]
 *    operationDiscovery: { mode: 'resourceTree', includeSubResources: true }
 *
 * 3. Usage trace discovery:
 *    operationDiscovery: { mode: 'usageTrace', usageTraceGlobs: ['logs/**'] }
 *
 * 4. Advanced dependency control:
 *    resolution: { stopAtPatterns: ['PageInfo', 'PageToken'] }
 *
 * 5. Dynamic size thresholds:
 *    validation: { warnOnSizeThreshold: 500000, failOnSizeLimit: 2000000 }
 *
 * These will be added incrementally after Phase 1 proves the core concept.
 */

/**
 * Validate configuration at startup
 *
 * This ensures the configuration is valid before attempting extraction.
 * Throws detailed Zod errors if validation fails.
 */
export function validateConfig(config: unknown): SchemaExtractionConfig {
  return SchemaExtractionConfigSchema.parse(config);
}

/**
 * Export validated configuration (use this in scripts)
 */
export const VALIDATED_CONFIG = validateConfig(SCHEMA_EXTRACTION_CONFIG);

/**
 * Targeting Metadata Registry
 *
 * Defines all DV360 targeting types and their configurations for the
 * assignedTargetingOptions endpoints.
 */

/**
 * All 49 targeting types supported by DV360 API v4
 * @see https://developers.google.com/display-video/api/reference/rest/v4/TargetingType
 */
export const ALL_TARGETING_TYPES = [
  // Content & Audience
  'TARGETING_TYPE_CHANNEL',
  'TARGETING_TYPE_APP_CATEGORY',
  'TARGETING_TYPE_APP',
  'TARGETING_TYPE_URL',
  'TARGETING_TYPE_AGE_RANGE',
  'TARGETING_TYPE_GENDER',
  'TARGETING_TYPE_PARENTAL_STATUS',
  'TARGETING_TYPE_HOUSEHOLD_INCOME',
  'TARGETING_TYPE_AUDIENCE_GROUP',
  // Location
  'TARGETING_TYPE_REGIONAL_LOCATION_LIST',
  'TARGETING_TYPE_PROXIMITY_LOCATION_LIST',
  'TARGETING_TYPE_GEO_REGION',
  'TARGETING_TYPE_POI',
  'TARGETING_TYPE_BUSINESS_CHAIN',
  // Device & Environment
  'TARGETING_TYPE_DEVICE_TYPE',
  'TARGETING_TYPE_BROWSER',
  'TARGETING_TYPE_OPERATING_SYSTEM',
  'TARGETING_TYPE_DEVICE_MAKE_MODEL',
  'TARGETING_TYPE_CARRIER_AND_ISP',
  'TARGETING_TYPE_ENVIRONMENT',
  'TARGETING_TYPE_OMID',
  // Video & Media
  'TARGETING_TYPE_VIDEO_PLAYER_SIZE',
  'TARGETING_TYPE_USER_REWARDED_CONTENT',
  'TARGETING_TYPE_CONTENT_INSTREAM_POSITION',
  'TARGETING_TYPE_CONTENT_OUTSTREAM_POSITION',
  'TARGETING_TYPE_CONTENT_DURATION',
  'TARGETING_TYPE_CONTENT_STREAM_TYPE',
  'TARGETING_TYPE_AUDIO_CONTENT_TYPE',
  'TARGETING_TYPE_CONTENT_GENRE',
  'TARGETING_TYPE_NATIVE_CONTENT_POSITION',
  'TARGETING_TYPE_ON_SCREEN_POSITION',
  // Inventory
  'TARGETING_TYPE_INVENTORY_SOURCE',
  'TARGETING_TYPE_INVENTORY_SOURCE_GROUP',
  'TARGETING_TYPE_EXCHANGE',
  'TARGETING_TYPE_SUB_EXCHANGE',
  // Keywords & Exclusions
  'TARGETING_TYPE_KEYWORD',
  'TARGETING_TYPE_NEGATIVE_KEYWORD_LIST',
  'TARGETING_TYPE_DIGITAL_CONTENT_LABEL_EXCLUSION',
  'TARGETING_TYPE_SENSITIVE_CATEGORY_EXCLUSION',
  'TARGETING_TYPE_CONTENT_THEME_EXCLUSION',
  // Other
  'TARGETING_TYPE_DAY_AND_TIME',
  'TARGETING_TYPE_VIEWABILITY',
  'TARGETING_TYPE_CATEGORY',
  'TARGETING_TYPE_LANGUAGE',
  'TARGETING_TYPE_AUTHORIZED_SELLER_STATUS',
  'TARGETING_TYPE_YOUTUBE_VIDEO',
  'TARGETING_TYPE_YOUTUBE_CHANNEL',
  'TARGETING_TYPE_SESSION_POSITION',
  'TARGETING_TYPE_THIRD_PARTY_VERIFIER',
] as const;

export type TargetingType = (typeof ALL_TARGETING_TYPES)[number];

/**
 * Configuration for targeting parent entity types
 */
export interface TargetingParentConfig {
  apiPathTemplate: string;
  requiredIds: readonly string[];
  entityIdField: string;
}

/**
 * Parent entity configurations for targeting endpoints.
 *
 * Single source of truth: adding a new parent type here automatically updates:
 * - Supported `parentType` enum values in tools (via `getSupportedTargetingParentTypes()`)
 * - TypeScript `TargetingParentType` union (derived from this object keys)
 * - Input schema ID fields (via `getTargetingRequiredIdFields()`)
 */
export const TARGETING_PARENT_TYPES = {
  insertionOrder: {
    apiPathTemplate:
      '/advertisers/{advertiserId}/insertionOrders/{insertionOrderId}/targetingTypes/{targetingType}/assignedTargetingOptions',
    requiredIds: ['advertiserId', 'insertionOrderId'] as const,
    entityIdField: 'insertionOrderId',
  },
  lineItem: {
    apiPathTemplate:
      '/advertisers/{advertiserId}/lineItems/{lineItemId}/targetingTypes/{targetingType}/assignedTargetingOptions',
    requiredIds: ['advertiserId', 'lineItemId'] as const,
    entityIdField: 'lineItemId',
  },
  adGroup: {
    apiPathTemplate:
      '/advertisers/{advertiserId}/adGroups/{adGroupId}/targetingTypes/{targetingType}/assignedTargetingOptions',
    requiredIds: ['advertiserId', 'adGroupId'] as const,
    entityIdField: 'adGroupId',
  },
} as const satisfies Record<string, TargetingParentConfig>;

/**
 * Parent entity types that support assigned targeting options (derived)
 */
export type TargetingParentType = keyof typeof TARGETING_PARENT_TYPES;

/**
 * Union of all required ID field names across all parent types (excluding advertiserId when used with tools)
 */
export type TargetingRequiredIdField =
  (typeof TARGETING_PARENT_TYPES)[TargetingParentType]['requiredIds'][number];

/**
 * Targeting type descriptions for documentation and AI guidance
 */
export const TARGETING_TYPE_DESCRIPTIONS: Record<TargetingType, string> = {
  TARGETING_TYPE_CHANNEL: 'Target or exclude specific channels (websites or apps)',
  TARGETING_TYPE_APP_CATEGORY: 'Target specific app categories from Google Play or App Store',
  TARGETING_TYPE_APP: 'Target or exclude specific mobile apps',
  TARGETING_TYPE_URL: 'Target or exclude specific URLs/domains',
  TARGETING_TYPE_AGE_RANGE: 'Target users by age range demographics',
  TARGETING_TYPE_GENDER: 'Target users by gender demographics',
  TARGETING_TYPE_PARENTAL_STATUS: 'Target users by parental status',
  TARGETING_TYPE_HOUSEHOLD_INCOME: 'Target users by household income bracket',
  TARGETING_TYPE_AUDIENCE_GROUP: 'Target custom audience groups (first-party, third-party, combined)',
  TARGETING_TYPE_REGIONAL_LOCATION_LIST: 'Target geographic regions from a location list',
  TARGETING_TYPE_PROXIMITY_LOCATION_LIST: 'Target users near specific locations (proximity)',
  TARGETING_TYPE_GEO_REGION: 'Target specific geographic regions (country, state, city, DMA)',
  TARGETING_TYPE_POI: 'Target users near points of interest',
  TARGETING_TYPE_BUSINESS_CHAIN: 'Target users near specific business chains',
  TARGETING_TYPE_DEVICE_TYPE: 'Target by device type (desktop, mobile, tablet, TV)',
  TARGETING_TYPE_BROWSER: 'Target specific web browsers',
  TARGETING_TYPE_OPERATING_SYSTEM: 'Target specific operating systems',
  TARGETING_TYPE_DEVICE_MAKE_MODEL: 'Target specific device manufacturers and models',
  TARGETING_TYPE_CARRIER_AND_ISP: 'Target users by mobile carrier or ISP',
  TARGETING_TYPE_ENVIRONMENT: 'Target by environment (web, app)',
  TARGETING_TYPE_OMID: 'Target OMID-enabled inventory for viewability measurement',
  TARGETING_TYPE_VIDEO_PLAYER_SIZE: 'Target by video player size',
  TARGETING_TYPE_USER_REWARDED_CONTENT: 'Target rewarded content inventory',
  TARGETING_TYPE_CONTENT_INSTREAM_POSITION: 'Target by in-stream video position (pre/mid/post-roll)',
  TARGETING_TYPE_CONTENT_OUTSTREAM_POSITION: 'Target by out-stream video position',
  TARGETING_TYPE_CONTENT_DURATION: 'Target by video content duration',
  TARGETING_TYPE_CONTENT_STREAM_TYPE: 'Target by stream type (live vs on-demand)',
  TARGETING_TYPE_AUDIO_CONTENT_TYPE: 'Target by audio content type (music, podcast, etc.)',
  TARGETING_TYPE_CONTENT_GENRE: 'Target by content genre categories',
  TARGETING_TYPE_NATIVE_CONTENT_POSITION: 'Target by native ad position',
  TARGETING_TYPE_ON_SCREEN_POSITION: 'Target by on-screen ad position',
  TARGETING_TYPE_INVENTORY_SOURCE: 'Target specific inventory sources (deals)',
  TARGETING_TYPE_INVENTORY_SOURCE_GROUP: 'Target inventory source groups',
  TARGETING_TYPE_EXCHANGE: 'Target specific ad exchanges',
  TARGETING_TYPE_SUB_EXCHANGE: 'Target specific sub-exchanges',
  TARGETING_TYPE_KEYWORD: 'Target or exclude specific keywords',
  TARGETING_TYPE_NEGATIVE_KEYWORD_LIST: 'Apply a negative keyword list for exclusion',
  TARGETING_TYPE_DIGITAL_CONTENT_LABEL_EXCLUSION: 'Exclude content by digital content labels',
  TARGETING_TYPE_SENSITIVE_CATEGORY_EXCLUSION: 'Exclude sensitive content categories',
  TARGETING_TYPE_CONTENT_THEME_EXCLUSION: 'Exclude content by content theme',
  TARGETING_TYPE_DAY_AND_TIME: 'Target by specific days and times (dayparting)',
  TARGETING_TYPE_VIEWABILITY: 'Target by minimum viewability threshold',
  TARGETING_TYPE_CATEGORY: 'Target by content categories',
  TARGETING_TYPE_LANGUAGE: 'Target by user language',
  TARGETING_TYPE_AUTHORIZED_SELLER_STATUS: 'Target by authorized seller (ads.txt) status',
  TARGETING_TYPE_YOUTUBE_VIDEO: 'Target specific YouTube videos',
  TARGETING_TYPE_YOUTUBE_CHANNEL: 'Target specific YouTube channels',
  TARGETING_TYPE_SESSION_POSITION: 'Target by session position (first impression, etc.)',
  TARGETING_TYPE_THIRD_PARTY_VERIFIER: 'Apply third-party verification settings',
};

/**
 * Map targeting type to its detail schema name suffix
 * Used to construct schema names like "ChannelAssignedTargetingOptionDetails"
 */
export function getTargetingDetailSchemaName(targetingType: TargetingType): string {
  // DV360 schema names are not always a 1:1 transformation of the enum string.
  // In particular, some targeting types with `_EXCLUSION` suffix map to schemas
  // without the word "Exclusion" in the schema name.
  const schemaNameOverrides: Partial<Record<TargetingType, string>> = {
    TARGETING_TYPE_DIGITAL_CONTENT_LABEL_EXCLUSION: 'DigitalContentLabelAssignedTargetingOptionDetails',
    TARGETING_TYPE_SENSITIVE_CATEGORY_EXCLUSION: 'SensitiveCategoryAssignedTargetingOptionDetails',
    TARGETING_TYPE_CONTENT_THEME_EXCLUSION: 'ContentThemeAssignedTargetingOptionDetails',
  };

  const override = schemaNameOverrides[targetingType];
  if (override) return override;

  // Remove TARGETING_TYPE_ prefix and convert to PascalCase
  const suffix = targetingType
    .replace('TARGETING_TYPE_', '')
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');

  return `${suffix}AssignedTargetingOptionDetails`;
}

/**
 * Build the API path for a targeting operation
 */
export function buildTargetingApiPath(
  parentType: TargetingParentType,
  ids: Record<string, string>,
  targetingType: TargetingType,
  assignedTargetingOptionId?: string
): string {
  const config: TargetingParentConfig = TARGETING_PARENT_TYPES[parentType];
  let path = config.apiPathTemplate;

  // Replace all provided path parameters (supports future templates with additional IDs)
  for (const [key, value] of Object.entries(ids)) {
    path = path.replaceAll(`{${key}}`, value);
  }
  path = path.replaceAll('{targetingType}', targetingType);

  // Append option ID for get/delete operations
  if (assignedTargetingOptionId) {
    path = `${path}/${assignedTargetingOptionId}`;
  }

  return path;
}

/**
 * Validate that all required IDs are present for a parent type
 */
export function validateTargetingIds(
  parentType: TargetingParentType,
  ids: Record<string, string>
): { valid: boolean; missingIds: string[] } {
  const config = TARGETING_PARENT_TYPES[parentType];
  const missingIds = config.requiredIds.filter((id) => !ids[id]);

  return {
    valid: missingIds.length === 0,
    missingIds,
  };
}

/**
 * Get the entity ID field name for a parent type
 */
export function getEntityIdField(parentType: TargetingParentType): string {
  return TARGETING_PARENT_TYPES[parentType].entityIdField;
}

/**
 * Check if a targeting type is valid
 */
export function isValidTargetingType(type: string): type is TargetingType {
  return ALL_TARGETING_TYPES.includes(type as TargetingType);
}

// =============================================================================
// Dynamic Parent Type Helpers (for data-driven tool pattern)
// =============================================================================

/**
 * Get all supported targeting parent types dynamically
 * Equivalent to getSupportedEntityTypesDynamic() for entities
 */
export function getSupportedTargetingParentTypes(): TargetingParentType[] {
  return Object.keys(TARGETING_PARENT_TYPES) as TargetingParentType[];
}

/**
 * Check if a parent type is valid
 */
export function isValidTargetingParentType(parentType: string): parentType is TargetingParentType {
  return parentType in TARGETING_PARENT_TYPES;
}

/**
 * Get the union of all required ID fields across all parent types (excluding advertiserId)
 */
export function getTargetingRequiredIdFields(): string[] {
  const fields = new Set<string>();
  for (const parentType of getSupportedTargetingParentTypes()) {
    const config = TARGETING_PARENT_TYPES[parentType];
    for (const id of config.requiredIds) {
      if (id !== 'advertiserId') {
        fields.add(id);
      }
    }
  }
  return Array.from(fields);
}

/**
 * Get targeting parent configuration with validation
 * Equivalent to getEntityConfigDynamic() for entities
 */
export function getTargetingParentConfig(parentType: string): TargetingParentConfig {
  if (!isValidTargetingParentType(parentType)) {
    throw new Error(
      `Unknown targeting parent type: ${parentType}. ` +
        `Supported types: ${getSupportedTargetingParentTypes().join(', ')}`
    );
  }
  return TARGETING_PARENT_TYPES[parentType];
}

/**
 * Input type for targeting validation functions
 * Uses unknown for flexibility with various schema types
 */
type TargetingInputData = { parentType: string } & Record<string, unknown>;

/**
 * Extract the entity ID from input based on parent type
 * Replaces switch statements in tool logic
 */
export function extractTargetingEntityId(
  parentType: TargetingParentType,
  input: Record<string, unknown>
): string {
  const config = getTargetingParentConfig(parentType);
  const entityId = input[config.entityIdField];
  if (typeof entityId !== 'string' || !entityId) {
    throw new Error(`Missing required ${config.entityIdField} for parentType '${parentType}'`);
  }
  return entityId;
}

/**
 * Build IDs object for targeting service calls
 * Replaces manual switch-based ID building in tools
 */
export function buildTargetingIds(
  parentType: TargetingParentType,
  advertiserId: string,
  input: Record<string, unknown>
): Record<string, string> {
  const config = getTargetingParentConfig(parentType);
  const ids: Record<string, string> = {};

  for (const requiredId of config.requiredIds) {
    if (requiredId === 'advertiserId') {
      ids.advertiserId = advertiserId;
      continue;
    }

    const value = input[requiredId];
    if (typeof value !== 'string' || !value) {
      throw new Error(`Missing required ${requiredId} for parentType '${parentType}'`);
    }
    ids[requiredId] = value;
  }

  return ids;
}

/**
 * Validate targeting input has correct entity ID for parent type
 * Used in Zod schema refinement - replaces hardcoded switch
 */
export function validateTargetingInput(data: TargetingInputData): boolean {
  if (!isValidTargetingParentType(data.parentType)) {
    return false;
  }

  const config = TARGETING_PARENT_TYPES[data.parentType];
  for (const requiredId of config.requiredIds) {
    if (requiredId === 'advertiserId') continue;
    const value = data[requiredId];
    if (typeof value !== 'string' || value.length === 0) {
      return false;
    }
  }

  return true;
}

/**
 * Generate error message for targeting input validation
 * Used in Zod schema refinement error callback
 */
export function getTargetingValidationError(data: TargetingInputData): { message: string; path: string[] } {
  if (!isValidTargetingParentType(data.parentType)) {
    return {
      message: `Invalid parentType '${data.parentType}'. Supported: ${getSupportedTargetingParentTypes().join(', ')}`,
      path: ['parentType'],
    };
  }

  const config = TARGETING_PARENT_TYPES[data.parentType];
  const missingIds = config.requiredIds
    .filter((id) => id !== 'advertiserId')
    .filter((id) => typeof data[id] !== 'string' || !(data[id] as string).length);

  const requiredIds = config.requiredIds.filter((id) => id !== 'advertiserId');
  return {
    message: `Missing required ID(s) for parentType '${data.parentType}': ${missingIds.join(', ') || requiredIds.join(', ')}. Required: ${requiredIds.join(', ')}`,
    path: missingIds.length > 0 ? missingIds : ['unknown'],
  };
}

/**
 * Targeting categories for grouping in UI/documentation
 */
export const TARGETING_CATEGORIES = {
  'Content & Audience': [
    'TARGETING_TYPE_CHANNEL',
    'TARGETING_TYPE_APP_CATEGORY',
    'TARGETING_TYPE_APP',
    'TARGETING_TYPE_URL',
    'TARGETING_TYPE_AGE_RANGE',
    'TARGETING_TYPE_GENDER',
    'TARGETING_TYPE_PARENTAL_STATUS',
    'TARGETING_TYPE_HOUSEHOLD_INCOME',
    'TARGETING_TYPE_AUDIENCE_GROUP',
  ],
  Location: [
    'TARGETING_TYPE_REGIONAL_LOCATION_LIST',
    'TARGETING_TYPE_PROXIMITY_LOCATION_LIST',
    'TARGETING_TYPE_GEO_REGION',
    'TARGETING_TYPE_POI',
    'TARGETING_TYPE_BUSINESS_CHAIN',
  ],
  'Device & Environment': [
    'TARGETING_TYPE_DEVICE_TYPE',
    'TARGETING_TYPE_BROWSER',
    'TARGETING_TYPE_OPERATING_SYSTEM',
    'TARGETING_TYPE_DEVICE_MAKE_MODEL',
    'TARGETING_TYPE_CARRIER_AND_ISP',
    'TARGETING_TYPE_ENVIRONMENT',
    'TARGETING_TYPE_OMID',
  ],
  'Video & Media': [
    'TARGETING_TYPE_VIDEO_PLAYER_SIZE',
    'TARGETING_TYPE_USER_REWARDED_CONTENT',
    'TARGETING_TYPE_CONTENT_INSTREAM_POSITION',
    'TARGETING_TYPE_CONTENT_OUTSTREAM_POSITION',
    'TARGETING_TYPE_CONTENT_DURATION',
    'TARGETING_TYPE_CONTENT_STREAM_TYPE',
    'TARGETING_TYPE_AUDIO_CONTENT_TYPE',
    'TARGETING_TYPE_CONTENT_GENRE',
    'TARGETING_TYPE_NATIVE_CONTENT_POSITION',
    'TARGETING_TYPE_ON_SCREEN_POSITION',
  ],
  Inventory: [
    'TARGETING_TYPE_INVENTORY_SOURCE',
    'TARGETING_TYPE_INVENTORY_SOURCE_GROUP',
    'TARGETING_TYPE_EXCHANGE',
    'TARGETING_TYPE_SUB_EXCHANGE',
  ],
  'Keywords & Exclusions': [
    'TARGETING_TYPE_KEYWORD',
    'TARGETING_TYPE_NEGATIVE_KEYWORD_LIST',
    'TARGETING_TYPE_DIGITAL_CONTENT_LABEL_EXCLUSION',
    'TARGETING_TYPE_SENSITIVE_CATEGORY_EXCLUSION',
    'TARGETING_TYPE_CONTENT_THEME_EXCLUSION',
  ],
  Other: [
    'TARGETING_TYPE_DAY_AND_TIME',
    'TARGETING_TYPE_VIEWABILITY',
    'TARGETING_TYPE_CATEGORY',
    'TARGETING_TYPE_LANGUAGE',
    'TARGETING_TYPE_AUTHORIZED_SELLER_STATUS',
    'TARGETING_TYPE_YOUTUBE_VIDEO',
    'TARGETING_TYPE_YOUTUBE_CHANNEL',
    'TARGETING_TYPE_SESSION_POSITION',
    'TARGETING_TYPE_THIRD_PARTY_VERIFIER',
  ],
} as const;

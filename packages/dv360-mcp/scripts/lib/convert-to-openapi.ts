/**
 * Discovery → OpenAPI Converter
 *
 * Converts Google Discovery Document schemas to OpenAPI 3.0 format.
 * Handles Discovery-specific extensions and generates conversion reports.
 */

import {
  DiscoveryDocument,
  DiscoverySchema,
  DiscoveryProperty,
  OpenAPISpec,
  OpenAPISchema,
  OpenAPIProperty,
  ConversionReport,
  UnmappedField,
  LossyConversion,
  ExtractionReport,
} from './types.js';
import type { SchemaExtractionConfig } from '../../config/schema-extraction.config.js';

/**
 * Convert extracted Discovery schemas to OpenAPI 3.0 specification
 *
 * @param schemas - Extracted Discovery schemas
 * @param discoveryDoc - Original Discovery document (for metadata)
 * @param extractionReport - Report from schema extraction
 * @param config - Schema extraction configuration
 * @returns OpenAPI 3.0 specification
 */
export async function convertToOpenAPI(
  schemas: Record<string, DiscoverySchema>,
  discoveryDoc: DiscoveryDocument,
  extractionReport: ExtractionReport,
  config: SchemaExtractionConfig
): Promise<OpenAPISpec> {
  console.log('🔄 Converting to OpenAPI 3.0...');

  const conversionContext = {
    unmappedFields: [] as UnmappedField[],
    lossyConversions: [] as LossyConversion[],
    newSchemas: [] as string[],
  };

  // Convert each schema
  const openApiSchemas: Record<string, OpenAPISchema> = {};
  for (const [schemaName, discoverySchema] of Object.entries(schemas)) {
    openApiSchemas[schemaName] = convertSchema(
      schemaName,
      discoverySchema,
      conversionContext
    );
  }

  // Generate OpenAPI spec wrapper
  const openApiSpec: OpenAPISpec = {
    openapi: '3.0.0',
    info: {
      title: discoveryDoc.title || `${discoveryDoc.name} API Minimal Schema`,
      version: discoveryDoc.version || config.apiVersion,
      description: discoveryDoc.description || 'Extracted minimal schema subset',
      'x-extraction-metadata': extractionReport.extractionMetadata,
    },
    paths: {}, // Required by OpenAPI 3.0 spec, even if empty
    components: {
      schemas: openApiSchemas,
    },
  };

  // Log conversion statistics
  console.log(`   ✓ Converted ${Object.keys(openApiSchemas).length} schemas`);
  if (conversionContext.unmappedFields.length > 0) {
    console.log(`     ⚠️  ${conversionContext.unmappedFields.length} unmapped fields`);
  }
  if (conversionContext.lossyConversions.length > 0) {
    console.log(`     ⚠️  ${conversionContext.lossyConversions.length} lossy conversions`);
  }

  return openApiSpec;
}

/**
 * Convert a single Discovery schema to OpenAPI schema
 */
function convertSchema(
  schemaName: string,
  discoverySchema: DiscoverySchema,
  context: {
    unmappedFields: UnmappedField[];
    lossyConversions: LossyConversion[];
    newSchemas: string[];
  }
): OpenAPISchema {
  const openApiSchema: OpenAPISchema = {};

  // Copy basic fields
  if (discoverySchema.type) {
    openApiSchema.type = discoverySchema.type;
  }

  if (discoverySchema.description) {
    openApiSchema.description = discoverySchema.description;
  }

  if (discoverySchema.format) {
    openApiSchema.format = discoverySchema.format;
  }

  if (discoverySchema.pattern) {
    openApiSchema.pattern = discoverySchema.pattern;
  }

  if (discoverySchema.minimum !== undefined) {
    openApiSchema.minimum = discoverySchema.minimum;
  }

  if (discoverySchema.maximum !== undefined) {
    openApiSchema.maximum = discoverySchema.maximum;
  }

  if (discoverySchema.deprecated) {
    openApiSchema.deprecated = discoverySchema.deprecated;
  }

  // Convert $ref
  if (discoverySchema.$ref) {
    openApiSchema.$ref = convertRef(discoverySchema.$ref);
  }

  // Convert enum with descriptions
  if (discoverySchema.enum) {
    openApiSchema.enum = discoverySchema.enum;
    if (discoverySchema.enumDescriptions) {
      // Store enum descriptions in vendor extension
      openApiSchema['x-enumDescriptions'] = discoverySchema.enumDescriptions;
    }
  }

  // Convert properties
  if (discoverySchema.properties) {
    openApiSchema.properties = {};
    for (const [propName, propSchema] of Object.entries(discoverySchema.properties)) {
      openApiSchema.properties[propName] = convertProperty(
        schemaName,
        propName,
        propSchema,
        context
      );
    }
  }

  // Convert required fields
  // Priority: 1) explicit required array, 2) parse from descriptions, 3) manual overrides
  if (discoverySchema.required && Array.isArray(discoverySchema.required)) {
    openApiSchema.required = discoverySchema.required;
  } else {
    // Extract required fields from property descriptions
    const requiredFromDescriptions = extractRequiredFieldsFromDescriptions(
      schemaName,
      discoverySchema
    );
    if (requiredFromDescriptions.length > 0) {
      openApiSchema.required = requiredFromDescriptions;
    }
  }

  // Convert additionalProperties
  if (discoverySchema.additionalProperties) {
    if (typeof discoverySchema.additionalProperties === 'object') {
      openApiSchema.additionalProperties = convertProperty(
        schemaName,
        'additionalProperties',
        discoverySchema.additionalProperties,
        context
      );
    } else {
      openApiSchema.additionalProperties = discoverySchema.additionalProperties;
    }
  }

  // Convert items (for arrays)
  if (discoverySchema.items) {
    openApiSchema.items = convertProperty(
      schemaName,
      'items',
      discoverySchema.items,
      context
    );
  }

  return openApiSchema;
}

/**
 * Convert a Discovery property to OpenAPI property
 */
function convertProperty(
  schemaName: string,
  propName: string,
  discoveryProp: DiscoveryProperty,
  context: {
    unmappedFields: UnmappedField[];
    lossyConversions: LossyConversion[];
    newSchemas: string[];
  }
): OpenAPIProperty {
  const openApiProp: OpenAPIProperty = {};

  // Handle Discovery "repeated" field (convert to array)
  if (discoveryProp.repeated) {
    openApiProp.type = 'array';
    openApiProp.items = convertProperty(
      schemaName,
      `${propName}[]`,
      {
        ...discoveryProp,
        repeated: false, // Remove repeated flag from nested property
      },
      context
    );
    return openApiProp;
  }

  // Copy basic fields
  if (discoveryProp.type) {
    openApiProp.type = discoveryProp.type;
  }

  if (discoveryProp.description) {
    openApiProp.description = discoveryProp.description;
  }

  if (discoveryProp.format) {
    openApiProp.format = discoveryProp.format;
  }

  if (discoveryProp.pattern) {
    openApiProp.pattern = discoveryProp.pattern;
  }

  if (discoveryProp.minimum !== undefined) {
    openApiProp.minimum = discoveryProp.minimum;
  }

  if (discoveryProp.maximum !== undefined) {
    openApiProp.maximum = discoveryProp.maximum;
  }

  if (discoveryProp.deprecated) {
    openApiProp.deprecated = discoveryProp.deprecated;
  }

  // Convert $ref
  if (discoveryProp.$ref) {
    openApiProp.$ref = convertRef(discoveryProp.$ref);
  }

  // Convert enum with descriptions
  if (discoveryProp.enum) {
    openApiProp.enum = discoveryProp.enum;
    if (discoveryProp.enumDescriptions) {
      openApiProp['x-enumDescriptions'] = discoveryProp.enumDescriptions;
    }
  }

  // Convert properties (for nested objects)
  if (discoveryProp.properties) {
    openApiProp.properties = {};
    for (const [nestedPropName, nestedProp] of Object.entries(discoveryProp.properties)) {
      openApiProp.properties[nestedPropName] = convertProperty(
        schemaName,
        `${propName}.${nestedPropName}`,
        nestedProp,
        context
      );
    }
  }

  // Convert additionalProperties
  if (discoveryProp.additionalProperties) {
    if (typeof discoveryProp.additionalProperties === 'object') {
      openApiProp.additionalProperties = convertProperty(
        schemaName,
        `${propName}.additionalProperties`,
        discoveryProp.additionalProperties,
        context
      );
    } else {
      openApiProp.additionalProperties = discoveryProp.additionalProperties;
    }
  }

  // Convert items (for arrays)
  if (discoveryProp.items) {
    openApiProp.items = convertProperty(
      schemaName,
      `${propName}[]`,
      discoveryProp.items,
      context
    );
  }

  // Track Discovery-specific "required" field on property
  // In Discovery, individual properties can be marked as required
  // In OpenAPI, required is an array on the parent schema
  if (discoveryProp.required) {
    context.unmappedFields.push({
      schemaName,
      fieldPath: propName,
      discoveryValue: discoveryProp.required,
      handlingStrategy: 'Property-level "required" should be moved to parent schema\'s required array',
    });
  }

  return openApiProp;
}

/**
 * Convert Discovery $ref to OpenAPI $ref
 *
 * Discovery: "Budget"
 * OpenAPI: "#/components/schemas/Budget"
 */
function convertRef(ref: string): string {
  // If already in OpenAPI format, return as-is
  if (ref.startsWith('#/')) {
    return ref;
  }

  // Convert Discovery format to OpenAPI format
  return `#/components/schemas/${ref}`;
}

/**
 * Generate conversion report
 *
 * Saved to .tmp-specs/conversion-report.json for debugging
 */
export function generateConversionReport(
  unmappedFields: UnmappedField[],
  lossyConversions: LossyConversion[],
  newSchemas: string[]
): ConversionReport {
  return {
    timestamp: new Date().toISOString(),
    unmappedFields,
    lossyConversions,
    newSchemas,
  };
}

/**
 * Markers in field descriptions that indicate output-only fields
 */
const OUTPUT_ONLY_MARKERS = {
  EXPLICIT: 'output only',
  ASSIGNED: 'assigned by the system',
} as const;

/**
 * Fields that should be excluded from required detection because they are output-only
 * These patterns apply to all schemas
 */
const OUTPUT_ONLY_PATTERNS: ReadonlyArray<RegExp> = [
  /^name$/,        // 'name' is usually the resource name (output-only)
  /^updateTime$/,  // updateTime is always output-only
  /^createTime$/,  // createTime is always output-only
] as const;

/**
 * Manual override registry for required fields
 *
 * When to use:
 * - add: Field is required but API description doesn't start with "Required"
 * - remove: Field incorrectly detected as required (e.g., conditionally required)
 * - reason: Document why the override is needed (helps future maintainers)
 *
 * Example scenarios:
 * - Conditionally required fields (required only if another field is set)
 * - Fields with non-standard description format
 * - Output-only fields not caught by pattern matching
 *
 * @example
 * ```typescript
 * const REQUIRED_FIELDS_OVERRIDES = {
 *   InsertionOrder: {
 *     add: ['customFieldNotDetected'],
 *     remove: ['incorrectlyDetectedField'],
 *     reason: 'Field X is only required when Y is set to Z',
 *   },
 * };
 * ```
 */
const REQUIRED_FIELDS_OVERRIDES: Record<
  string,
  { add?: string[]; remove?: string[]; reason?: string }
> = {
  PartnerRevenueModel: {
    remove: ['markupAmount'],
    reason: 'DV360 API omits markupAmount in GET responses when set to default/zero',
  },
  LineItemBudget: {
    remove: ['budgetAllocationType'],
    reason: 'DV360 API may omit budgetAllocationType for certain budget configurations',
  },
  TargetingExpansionConfig: {
    remove: ['enableOptimizedTargeting'],
    reason: 'DV360 API may omit enableOptimizedTargeting when optimized targeting is disabled',
  },
};

/**
 * Check if a field description indicates it's output-only
 */
function isOutputOnlyField(fieldName: string, description?: string): boolean {
  if (!description) return false;

  const lowerDesc = description.toLowerCase();

  // Check explicit markers in description (most reliable indicators)
  const hasOutputMarker = Object.values(OUTPUT_ONLY_MARKERS).some((marker) =>
    lowerDesc.includes(marker)
  );
  if (hasOutputMarker) {
    return true;
  }

  // Check field name patterns (only if not explicitly marked as required)
  // This prevents false positives for fields like campaignId which may be required inputs
  const isExplicitlyRequired = lowerDesc.startsWith('required');
  if (!isExplicitlyRequired) {
    for (const pattern of OUTPUT_ONLY_PATTERNS) {
      if (pattern.test(fieldName)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if a field description indicates it's required
 */
function isRequiredFromDescription(description?: string): boolean {
  if (!description) return false;

  const trimmed = description.trim();

  // Match various "Required" patterns at start of description:
  // - "Required. ..."
  // - "Required: ..."
  // - "Required ..."
  const requiredPattern = /^Required[\s.:]/i;

  return requiredPattern.test(trimmed);
}

/**
 * Extract required fields from schema property descriptions
 */
function extractRequiredFieldsFromDescriptions(
  schemaName: string,
  schema: DiscoverySchema
): string[] {
  const required: string[] = [];
  const stats = {
    detected: 0,
    excluded: 0,
    overrideAdded: 0,
    overrideRemoved: 0,
  };

  if (!schema.properties) {
    return required;
  }

  // Auto-detect from descriptions
  for (const [propName, propSchema] of Object.entries(schema.properties)) {
    // Skip if output-only
    if (isOutputOnlyField(propName, propSchema.description)) {
      stats.excluded++;
      continue;
    }

    // Check if description indicates required
    if (isRequiredFromDescription(propSchema.description)) {
      required.push(propName);
      stats.detected++;
    }
  }

  // Apply manual overrides if present
  const overrides = REQUIRED_FIELDS_OVERRIDES[schemaName];
  if (overrides) {
    // Add manually specified required fields
    if (overrides.add) {
      for (const field of overrides.add) {
        if (!required.includes(field)) {
          required.push(field);
          stats.overrideAdded++;
        }
      }
    }

    // Remove fields that shouldn't be required
    if (overrides.remove) {
      const originalLength = required.length;
      const filtered = required.filter(field => !overrides.remove!.includes(field));
      stats.overrideRemoved = originalLength - filtered.length;

      // Log override activity
      if (stats.overrideAdded > 0 || stats.overrideRemoved > 0) {
        console.log(
          `     ${schemaName}: Manual override applied (${overrides.reason || 'no reason provided'})`
        );
        if (stats.overrideAdded > 0) {
          console.log(`       + Added: ${overrides.add?.join(', ')}`);
        }
        if (stats.overrideRemoved > 0) {
          console.log(`       - Removed: ${overrides.remove?.join(', ')}`);
        }
      }

      return filtered;
    }
  }

  // Log detection metrics for schemas with required fields
  if (required.length > 0) {
    console.log(
      `     ${schemaName}: ${required.length} required field(s) detected, ${stats.excluded} excluded`
    );
  }

  return required;
}

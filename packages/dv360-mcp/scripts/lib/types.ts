/**
 * Type definitions for Discovery Document and OpenAPI structures
 *
 * These types provide compile-time safety for the extraction pipeline.
 */

/**
 * Google Discovery Document structure
 *
 * @see https://developers.google.com/discovery/v1/reference/apis
 */
export interface DiscoveryDocument {
  kind: string;
  discoveryVersion: string;
  id: string;
  name: string;
  version: string;
  title: string;
  description: string;
  baseUrl: string;
  basePath: string;
  rootUrl: string;
  servicePath: string;
  parameters?: Record<string, DiscoveryParameter>;
  auth?: DiscoveryAuth;
  schemas: Record<string, DiscoverySchema>;
  resources?: Record<string, DiscoveryResource>;
  methods?: Record<string, DiscoveryMethod>;
}

/**
 * Discovery schema definition
 */
export interface DiscoverySchema {
  id?: string;
  type?: string;
  description?: string;
  properties?: Record<string, DiscoveryProperty>;
  additionalProperties?: DiscoveryProperty;
  items?: DiscoveryProperty;
  enum?: string[];
  enumDescriptions?: string[];
  required?: string[];
  $ref?: string;
  format?: string;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  deprecated?: boolean;
}

/**
 * Discovery property definition (used in schema properties, items, etc.)
 */
export interface DiscoveryProperty {
  type?: string;
  description?: string;
  $ref?: string;
  items?: DiscoveryProperty;
  additionalProperties?: DiscoveryProperty;
  properties?: Record<string, DiscoveryProperty>;
  enum?: string[];
  enumDescriptions?: string[];
  format?: string;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  repeated?: boolean; // Discovery-specific: indicates array type
  required?: boolean;
  deprecated?: boolean;
}

/**
 * Discovery parameter definition
 */
export interface DiscoveryParameter {
  type: string;
  description?: string;
  required?: boolean;
  location?: "query" | "path" | "header";
  enum?: string[];
  enumDescriptions?: string[];
  pattern?: string;
  minimum?: number;
  maximum?: number;
}

/**
 * Discovery auth configuration
 */
export interface DiscoveryAuth {
  oauth2?: {
    scopes: Record<string, { description: string }>;
  };
}

/**
 * Discovery resource definition (nested structure)
 */
export interface DiscoveryResource {
  methods?: Record<string, DiscoveryMethod>;
  resources?: Record<string, DiscoveryResource>;
}

/**
 * Discovery method definition (API operation)
 */
export interface DiscoveryMethod {
  id: string;
  path: string;
  httpMethod: string;
  description?: string;
  parameters?: Record<string, DiscoveryParameter>;
  request?: {
    $ref?: string;
  };
  response?: {
    $ref?: string;
  };
  scopes?: string[];
}

/**
 * OpenAPI 3.0 specification structure
 */
export interface OpenAPISpec {
  openapi: "3.0.0";
  info: OpenAPIInfo;
  components: {
    schemas: Record<string, OpenAPISchema>;
  };
  paths?: Record<string, OpenAPIPath>; // Phase 2: operation extraction
}

/**
 * OpenAPI info object
 */
export interface OpenAPIInfo {
  title: string;
  version: string;
  description?: string;
  "x-extraction-metadata"?: ExtractionMetadata;
}

/**
 * OpenAPI schema definition
 */
export interface OpenAPISchema {
  type?: string;
  description?: string;
  properties?: Record<string, OpenAPIProperty>;
  additionalProperties?: boolean | OpenAPIProperty;
  items?: OpenAPIProperty;
  required?: string[];
  enum?: string[];
  "x-enumDescriptions"?: string[]; // Extension for enum descriptions
  format?: string;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  deprecated?: boolean;
  $ref?: string;
  oneOf?: OpenAPIProperty[];
  anyOf?: OpenAPIProperty[];
  allOf?: OpenAPIProperty[];
}

/**
 * OpenAPI property definition (used in schema properties, items, etc.)
 */
export interface OpenAPIProperty {
  type?: string;
  description?: string;
  $ref?: string;
  items?: OpenAPIProperty;
  additionalProperties?: boolean | OpenAPIProperty;
  properties?: Record<string, OpenAPIProperty>;
  required?: string[];
  enum?: string[];
  "x-enumDescriptions"?: string[];
  format?: string;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  deprecated?: boolean;
  oneOf?: OpenAPIProperty[];
  anyOf?: OpenAPIProperty[];
  allOf?: OpenAPIProperty[];
}

/**
 * OpenAPI path item (Phase 2+)
 */
export interface OpenAPIPath {
  get?: OpenAPIOperation;
  post?: OpenAPIOperation;
  put?: OpenAPIOperation;
  patch?: OpenAPIOperation;
  delete?: OpenAPIOperation;
}

/**
 * OpenAPI operation (Phase 2+)
 */
export interface OpenAPIOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  parameters?: OpenAPIParameter[];
  requestBody?: OpenAPIRequestBody;
  responses?: Record<string, OpenAPIResponse>;
}

/**
 * OpenAPI parameter (Phase 2+)
 */
export interface OpenAPIParameter {
  name: string;
  in: "query" | "path" | "header" | "cookie";
  description?: string;
  required?: boolean;
  schema: OpenAPIProperty;
}

/**
 * OpenAPI request body (Phase 2+)
 */
export interface OpenAPIRequestBody {
  description?: string;
  required?: boolean;
  content: Record<string, { schema: OpenAPIProperty }>;
}

/**
 * OpenAPI response (Phase 2+)
 */
export interface OpenAPIResponse {
  description: string;
  content?: Record<string, { schema: OpenAPIProperty }>;
}

/**
 * Extraction result returned by SchemaExtractor
 */
export interface ExtractionResult {
  schemas: Record<string, DiscoverySchema>;
  report: ExtractionReport;
}

/**
 * Detailed extraction report
 */
export interface ExtractionReport {
  extractionMetadata: ExtractionMetadata;
  configuration: ExtractionConfiguration;
  results: ExtractionResults;
  sizeAnalysis: SizeAnalysis;
  dependencyGraph: Record<string, string[]>;
  validation: ValidationResult;
}

/**
 * Extraction metadata
 */
export interface ExtractionMetadata {
  timestamp: string;
  apiVersion: string;
  discoveryDocUrl: string;
  discoveryDocSize: number;
  durationMs: number;
}

/**
 * Extraction configuration (subset used in report)
 */
export interface ExtractionConfiguration {
  rootSchemas: string[];
  includeCommonTypes: boolean;
  excludePatterns?: string[];
  resolutionMaxDepth: number;
}

/**
 * Extraction results
 */
export interface ExtractionResults {
  totalSchemas: number;
  rootSchemas: string[];
  resolvedDependencies: string[];
  commonTypesAdded: string[];
  excludedSchemas: string[];
  circularReferences: CircularReference[];
  warnings: ExtractionWarning[];
}

/**
 * Circular reference detected during extraction
 */
export interface CircularReference {
  path: string[]; // e.g., ['A', 'B', 'C', 'A']
  message: string;
}

/**
 * Warning generated during extraction
 */
export interface ExtractionWarning {
  type: string;
  message: string;
  severity: "info" | "warning" | "error";
  details?: Record<string, unknown>;
}

/**
 * Size analysis
 */
export interface SizeAnalysis {
  originalDiscoverySize: number;
  extractedSpecSize: number;
  compressionRatio: number; // 0.0 - 1.0 (how much smaller)
  estimatedGeneratedCodeSize: number;
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

/**
 * Validation error
 */
export interface ValidationError {
  code: string;
  message: string;
  severity: "error";
  details?: unknown;
}

/**
 * Validation warning
 */
export interface ValidationWarning {
  code: string;
  message: string;
  severity: "warning" | "info";
  details?: unknown;
}

/**
 * Conversion report (generated during Discovery → OpenAPI conversion)
 */
export interface ConversionReport {
  timestamp: string;
  unmappedFields: UnmappedField[];
  lossyConversions: LossyConversion[];
  newSchemas: string[];
}

/**
 * Unmapped field requiring vendor extension
 */
export interface UnmappedField {
  schemaName: string;
  fieldPath: string;
  discoveryValue: unknown;
  handlingStrategy: string; // How we handled it (e.g., "copied to x-google-*")
}

/**
 * Lossy conversion during transformation
 */
export interface LossyConversion {
  schemaName: string;
  fieldPath: string;
  originalValue: unknown;
  convertedValue: unknown;
  reason: string;
  severity: "warning" | "error";
}

/**
 * Cache entry for Discovery Document
 */
export interface CacheEntry {
  timestamp: number;
  ttl: number;
  discoveryDoc: DiscoveryDocument;
}

/**
 * Error codes used throughout extraction pipeline
 */
export const ErrorCodes = {
  DISCOVERY_FETCH_FAILED: "DISCOVERY_FETCH_FAILED",
  DISCOVERY_INVALID_FORMAT: "DISCOVERY_INVALID_FORMAT",
  SCHEMA_NOT_FOUND: "SCHEMA_NOT_FOUND",
  CIRCULAR_REFERENCE: "CIRCULAR_REFERENCE",
  MAX_DEPTH_EXCEEDED: "MAX_DEPTH_EXCEEDED",
  INVALID_CONFIG: "INVALID_CONFIG",
  CONVERSION_FAILED: "CONVERSION_FAILED",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  SIZE_LIMIT_EXCEEDED: "SIZE_LIMIT_EXCEEDED",
  OPERATION_TIMEOUT: "OPERATION_TIMEOUT",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/**
 * Custom error class for extraction failures
 */
export class ExtractionError extends Error {
  constructor(
    message: string,
    public readonly code: ErrorCode,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "ExtractionError";
    Error.captureStackTrace?.(this, ExtractionError);
  }
}

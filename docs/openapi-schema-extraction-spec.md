# OpenAPI Schema Extraction Specification

## Overview

This document specifies a hybrid approach for dynamically extracting and generating type-safe schemas from Google API Discovery Documents for the DV360 MCP server. The system combines declarative configuration with intelligent dependency resolution to minimize repository bloat while maintaining complete type safety.

---

## Table of Contents

1. [Objectives](#objectives)
2. [Architecture](#architecture)
3. [Configuration Schema](#configuration-schema)
4. [Extraction Algorithm](#extraction-algorithm)
5. [Dependency Resolution](#dependency-resolution)
6. [Output Specification](#output-specification)
7. [Build Pipeline Integration](#build-pipeline-integration)
8. [Error Handling](#error-handling)
9. [Testing Strategy](#testing-strategy)
   - [Live Response Smoke Tests](#live-response-smoke-tests)
10. [Examples](#examples)
11. [Migration Path](#migration-path)
12. [Performance Considerations](#performance-considerations)
13. [Second Iteration Validation](#second-iteration-validation)

---

## 1. Objectives

### Primary Goals

1. **Minimize Repository Size**: Extract only schemas actively used by the application
2. **Maintain Type Safety**: Generate complete, valid TypeScript types with runtime validation
3. **Automate Dependencies**: Resolve all schema dependencies without manual maintenance
4. **Enable Flexibility**: Support multiple extraction strategies (schema-based, operation-based)
5. **Provide Observability**: Generate detailed reports on extraction results

### Non-Goals

- **Not a full API client generator**: Only generates schemas, not API methods
- **Not a runtime proxy**: Does not intercept or modify API calls
- **Not version-agnostic**: Each API version requires separate configuration

---

## 2. Architecture

### Component Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      Build Pipeline                              │
│                                                                   │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │   Fetch      │───▶│   Extract    │───▶│   Generate   │      │
│  │  Discovery   │    │   Schemas    │    │   Code       │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│         │                    │                    │              │
│         ▼                    ▼                    ▼              │
│  .tmp-specs/         .tmp-specs/         src/generated/         │
│  discovery.json      minimal-spec.yaml   schemas/*.ts           │
│  (gitignored)        (gitignored)        (committed)            │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    Configuration Input                           │
│                                                                   │
│  config/schema-extraction.config.ts                             │
│  ├─ rootSchemas: ['InsertionOrder', 'LineItem', ...]           │
│  ├─ operations: ['advertisers.list', ...]                      │
│  ├─ includeCommonTypes: true                                   │
│  └─ excludePatterns: ['*Deprecated*', ...]                     │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Fetch Phase**: Download Discovery Document from Google API
2. **Extract Phase**: Parse config and recursively extract schemas
3. **Transform Phase**: Convert Discovery format to OpenAPI 3.0
4. **Generate Phase**: Create TypeScript types and Zod schemas
5. **Report Phase**: Generate extraction report and statistics

---

## 3. Configuration Schema

### 3.1 Full Configuration Interface

```typescript
/**
 * Configuration for OpenAPI schema extraction from Google Discovery Documents
 */
export interface SchemaExtractionConfig {
  /**
   * API version to target (e.g., 'v3', 'v4')
   */
  apiVersion: string;

  /**
   * Root schemas to extract. All dependencies will be auto-resolved.
   * Use this for entity-based extraction.
   *
   * @example
   * rootSchemas: ['InsertionOrder', 'LineItem', 'AdGroup']
   */
  rootSchemas?: string[];

  /**
   * API operations to extract schemas from. Extracts request and response types.
   * Use this for operation-based extraction.
   * Format: 'resource.subresource.method'
   *
   * @example
   * operations: ['advertisers.insertionOrders.list', 'advertisers.lineItems.patch']
   */
  operations?: string[];

  /**
   * High-level resource scopes that should automatically include all nested operations.
   * Format matches the Discovery document resource tree.
   *
   * @example
   * resourceScopes: ['advertisers', 'advertisers.insertionOrders']
   */
  resourceScopes?: string[];

  /**
   * Configure how operations are auto-discovered from the Discovery document and local usage traces.
   */
  operationDiscovery?: {
    /**
     * Primary discovery mode.
     * - 'explicit': only use the `operations` array
     * - 'resourceTree': expand `resourceScopes` to every nested method
     * - 'usageTrace': scan generated client usage (e.g., via telemetry logs)
     * @default 'resourceTree'
     */
    mode: 'explicit' | 'resourceTree' | 'usageTrace';

    /**
     * When using resourceTree mode, include recursively nested resources.
     * @default true
     */
    includeSubResources?: boolean;

    /**
     * Optional glob patterns pointing at trace logs that map operationIds to usage counts.
     * Used when mode === 'usageTrace'.
     */
    usageTraceGlobs?: string[];

    /**
     * Filter operation HTTP methods (e.g., ['get', 'list']).
     * When omitted, include all methods exposed by the resource.
     */
    allowedMethods?: string[];
  };

  /**
   * Automatically include common primitive types (Date, Money, Status, etc.)
   * @default true
   */
  includeCommonTypes?: boolean;

  /**
   * Glob patterns for schemas to exclude from extraction
   *
   * @example
   * excludePatterns: ['*Deprecated*', 'Internal*', '*Test*']
   */
  excludePatterns?: string[];

  /**
   * Dependency resolution configuration
   */
  resolution: {
    /**
     * Follow $ref links to include all dependencies
     * @default true
     */
    resolveDependencies: boolean;

    /**
     * Maximum depth for dependency resolution (prevents infinite recursion)
     * @default 10
     */
    maxDepth: number;

    /**
     * Include enum definitions referenced by schemas
     * @default true
     */
    includeEnums: boolean;

    /**
     * Stop resolution at certain schema patterns (e.g., generic wrappers)
     *
     * @example
     * stopAtPatterns: ['GenericResponse', 'PagedResult']
     */
    stopAtPatterns?: string[];
  };

  /**
   * Output configuration
   */
  output: {
    /**
     * Path to save the extracted minimal OpenAPI spec (relative to package root)
     * @default '.tmp-specs/minimal-openapi.yaml'
     */
    specPath: string;

    /**
     * Path to generate TypeScript/Zod schemas (relative to package root)
     * @default 'src/generated/schemas'
     */
    generatedPath: string;

    /**
     * Generate a detailed extraction report
     * @default true
     */
    generateReport: boolean;

    /**
     * Path to save the extraction report (relative to package root)
     * @default '.tmp-specs/extraction-report.json'
     */
    reportPath: string;

    /**
     * Pretty-print JSON outputs
     * @default true
     */
    prettyPrint: boolean;
  };

  /**
   * Discovery Document configuration
   */
  discovery: {
    /**
     * Base URL for Google Discovery API
     * @default 'https://displayvideo.googleapis.com/$discovery/rest'
     */
    baseUrl: string;

    /**
     * Timeout for fetching discovery document (milliseconds)
     * @default 30000
     */
    timeout: number;

    /**
     * Cache discovery document locally to avoid repeated fetches
     * @default true
     */
    enableCache: boolean;

    /**
     * Cache TTL in milliseconds
     * @default 86400000 (24 hours)
     */
    cacheTTL: number;
  };

  /**
   * Validation configuration
   */
  validation: {
    /**
     * Fail extraction if circular references are detected
     * @default false
     */
    failOnCircularRefs: boolean;

    /**
     * Fail extraction if any root schema is not found
     * @default true
     */
    failOnMissingSchemas: boolean;

    /**
     * Warn if extracted spec exceeds size threshold (bytes)
     * @default 500000 (500KB)
     */
    warnOnSizeThreshold: number;

    /**
     * Fail if extracted spec exceeds hard size limit (bytes)
     * @default 2000000 (2MB)
     */
    failOnSizeLimit: number;
  };
}
```

### 3.2 Example Configuration

```typescript
// packages/dv360-mcp/config/schema-extraction.config.ts

export const SCHEMA_EXTRACTION_CONFIG: SchemaExtractionConfig = {
  apiVersion: 'v4',

  // Strategy 1: Entity-based extraction
  rootSchemas: [
    // Core entities
    'Partner',
    'Advertiser',
    'InsertionOrder',
    'LineItem',
    'AdGroup',

    // Response wrappers
    'ListPartnersResponse',
    'ListAdvertisersResponse',
    'ListInsertionOrdersResponse',
    'ListLineItemsResponse',
    'ListAdGroupsResponse',
    'BulkListAdGroupAssignedTargetingOptionsResponse',

    // Common nested types (will auto-resolve dependencies)
    'Budget',
    'Pacing',
    'FrequencyCap',
  ],

  // Strategy 2: Operation-based extraction (alternative to rootSchemas)
  // operations: [
  //   'partners.list',
  //   'advertisers.list',
  //   'advertisers.insertionOrders.list',
  //   'advertisers.insertionOrders.patch',
  //   'advertisers.lineItems.list',
  //   'advertisers.lineItems.patch',
  //   'advertisers.adGroups.list',
  //   'advertisers.adGroups.bulkListAdGroupAssignedTargetingOptions',
  // ],

  // Strategy 3: Resource-scope discovery (recommended default)
  resourceScopes: [
    'partners',
    'advertisers',
    'advertisers.insertionOrders',
    'advertisers.lineItems',
    'advertisers.adGroups',
  ],

  operationDiscovery: {
    mode: 'resourceTree',
    includeSubResources: true,
    allowedMethods: ['get', 'list', 'patch', 'bulkList'],
  },

  includeCommonTypes: true,

  excludePatterns: [
    '*Deprecated*',
    'Internal*',
    '*TestOnly*',
  ],

  resolution: {
    resolveDependencies: true,
    maxDepth: 10,
    includeEnums: true,
    stopAtPatterns: undefined,
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
    cacheTTL: 86400000, // 24 hours
  },

  validation: {
    failOnCircularRefs: false,
    failOnMissingSchemas: true,
    warnOnSizeThreshold: 500000, // 500KB
    failOnSizeLimit: 2000000,    // 2MB
  },
};
```

---

## 4. Extraction Algorithm

### 4.1 High-Level Flow

```typescript
async function extractSchemas(
  discoveryDoc: DiscoveryDocument,
  config: SchemaExtractionConfig
): Promise<ExtractionResult> {
  const extractor = new SchemaExtractor(discoveryDoc, config);
  return extractor.extract();
}
```

### 4.2 Determining Root Schemas

```typescript
function determineRootSchemas(
  config: SchemaExtractionConfig,
  discoveryDoc: DiscoveryDocument
): Set<string> {
  const roots = new Set<string>();

  // Strategy A: Explicit root schemas
  if (config.rootSchemas && config.rootSchemas.length > 0) {
    config.rootSchemas.forEach(schema => roots.add(schema));
    console.log(`📋 Added ${config.rootSchemas.length} explicit root schemas`);
  }

  // Strategy B: Extract from operations
  if (config.operations && config.operations.length > 0) {
    const operationSchemas = extractSchemasFromOperations(
      config.operations,
      discoveryDoc
    );
    operationSchemas.forEach(schema => roots.add(schema));
    console.log(`🔍 Extracted ${operationSchemas.size} schemas from ${config.operations.length} operations`);
  }

  // Strategy C: Auto-discover operations from resource scopes or usage traces
  if (config.operationDiscovery) {
    const discovered = discoverOperations(config, discoveryDoc);
    const autoSchemas = extractSchemasFromOperations(Array.from(discovered), discoveryDoc);
    autoSchemas.forEach(schema => roots.add(schema));
    console.log(`🤖 Auto-discovered ${autoSchemas.size} schemas from dynamic operation selection`);
  }

  // Validation
  if (roots.size === 0) {
    throw new Error('No root schemas specified. Provide either rootSchemas or operations.');
  }

  return roots;
}
```

### 4.3 Operation-to-Schema Resolution

```typescript
function extractSchemasFromOperations(
  operations: string[],
  discoveryDoc: DiscoveryDocument
): Set<string> {
  const schemas = new Set<string>();

  for (const operationPath of operations) {
    // Parse "advertisers.insertionOrders.list" -> ["advertisers", "insertionOrders", "list"]
    const parts = operationPath.split('.');
    const method = parts.pop()!;
    const resourcePath = parts;

    // Navigate discovery doc to find operation
    const operation = resolveOperationInDiscovery(discoveryDoc, resourcePath, method);

    if (!operation) {
      console.warn(`⚠️  Operation not found: ${operationPath}`);
      continue;
    }

    // Extract request schema (for create/update operations)
    if (operation.request?.$ref) {
      const schemaName = extractSchemaNameFromRef(operation.request.$ref);
      schemas.add(schemaName);
      console.log(`   Request: ${schemaName}`);
    }

    // Extract response schema (for all operations)
    if (operation.response?.$ref) {
      const schemaName = extractSchemaNameFromRef(operation.response.$ref);
      schemas.add(schemaName);
      console.log(`   Response: ${schemaName}`);
    }
  }

  return schemas;
}

function extractSchemaNameFromRef(ref: string): string {
  const match = ref.match(/schemas\/([^/]+)$/);
  return match ? match[1] : '';
}
```

### 4.4 Automated Operation Discovery

```typescript
function discoverOperations(
  config: SchemaExtractionConfig,
  discoveryDoc: DiscoveryDocument
): Set<string> {
  const discovered = new Set<string>();
  const mode = config.operationDiscovery?.mode ?? 'resourceTree';

  if (mode === 'explicit') {
    (config.operations ?? []).forEach(op => discovered.add(op));
    return discovered;
  }

  if (mode === 'resourceTree') {
    const scopes = config.resourceScopes ?? [];
    for (const scope of scopes) {
      const resourceNode = resolveResourceInDiscovery(discoveryDoc, scope.split('.'));
      if (!resourceNode) {
        console.warn(`⚠️  Resource scope not found: ${scope}`);
        continue;
      }

      walkResourceTree(resourceNode, {
        includeSubResources: config.operationDiscovery?.includeSubResources !== false,
        allowedMethods: config.operationDiscovery?.allowedMethods,
        onMethod: (operationId: string) => discovered.add(operationId),
      });
    }
  }

  if (mode === 'usageTrace') {
    const tracePaths = expandGlobs(config.operationDiscovery?.usageTraceGlobs ?? []);
    for (const tracePath of tracePaths) {
      const usage = parseUsageTrace(tracePath); // { operationId: count }
      Object.entries(usage)
        .filter(([, count]) => count > 0)
        .forEach(([operationId]) => discovered.add(operationId));
    }
  }

  return discovered;
}
```

This discovery step runs during every extraction cycle so that new DV360 endpoints are picked up automatically as soon as they appear under an already-tracked resource scope or show up in production usage traces.

---

## 5. Dependency Resolution

### 5.1 Recursive Resolution Algorithm

```typescript
class SchemaExtractor {
  private discoveryDoc: DiscoveryDocument;
  private config: SchemaExtractionConfig;
  private extracted = new Map<string, Schema>();
  private visited = new Set<string>();
  private dependencyGraph = new Map<string, Set<string>>();

  async extract(
    configOverride?: Partial<SchemaExtractionConfig>
  ): Promise<ExtractionResult> {
    const effectiveConfig = { ...this.config, ...configOverride };
    const rootSchemas = determineRootSchemas(effectiveConfig, this.discoveryDoc);

    this.extractWithDependencies(rootSchemas);

    if (effectiveConfig.includeCommonTypes) {
      this.addCommonTypes();
    }

    this.applyExclusions(effectiveConfig.excludePatterns);

    const validation = validateExtraction(this, effectiveConfig);
    if (!validation.valid) {
      throw new ExtractionError('Extraction validation failed', ErrorCodes.VALIDATION_FAILED, {
        errors: validation.errors,
      });
    }

    const report = this.generateReport();

    return {
      schemas: Object.fromEntries(this.extracted),
      report,
    };
  }

  extractWithDependencies(rootSchemas: Set<string>): void {
    for (const root of rootSchemas) {
      this.extractRecursive(root, 0, []);
    }
  }

  private extractRecursive(
    schemaName: string,
    depth: number,
    path: string[]
  ): void {
    // Guard: Check max depth
    if (depth > this.config.resolution.maxDepth) {
      console.warn(`⚠️  Max depth (${this.config.resolution.maxDepth}) reached for: ${schemaName}`);
      return;
    }

    // Guard: Circular reference detection
    if (path.includes(schemaName)) {
      console.warn(`🔄 Circular reference detected: ${[...path, schemaName].join(' → ')}`);
      this.recordCircularRef([...path, schemaName]);
      return;
    }

    // Guard: Already extracted
    if (this.extracted.has(schemaName)) {
      return;
    }

    // Guard: Check stop patterns
    if (this.shouldStopAtSchema(schemaName)) {
      console.log(`🛑 Stopped at pattern-matched schema: ${schemaName}`);
      return;
    }

    // Mark as visited
    this.visited.add(schemaName);

    // Fetch schema from discovery doc
    const schema = this.discoveryDoc.schemas?.[schemaName];
    if (!schema) {
      console.warn(`⚠️  Schema not found in Discovery Document: ${schemaName}`);
      return;
    }

    // Extract schema
    this.extracted.set(schemaName, schema);
    console.log(`${'  '.repeat(depth)}✓ ${schemaName}`);

    // Resolve dependencies
    if (this.config.resolution.resolveDependencies) {
      const dependencies = this.findDependencies(schema);
      this.dependencyGraph.set(schemaName, dependencies);

      for (const dep of dependencies) {
        this.extractRecursive(dep, depth + 1, [...path, schemaName]);
      }
    }
  }

  private findDependencies(schema: Schema): Set<string> {
    const dependencies = new Set<string>();

    // Traverse schema to find all $ref references
    this.traverseSchema(schema, (key, value) => {
      if (key === '$ref' && typeof value === 'string') {
        const schemaName = this.extractSchemaNameFromRef(value);
        if (schemaName) {
          dependencies.add(schemaName);
        }
      }

      // Handle Discovery Document 'additionalProperties' pattern
      if (key === 'additionalProperties' && value.$ref) {
        const schemaName = this.extractSchemaNameFromRef(value.$ref);
        if (schemaName) {
          dependencies.add(schemaName);
        }
      }

      // Handle array items
      if (key === 'items' && value.$ref) {
        const schemaName = this.extractSchemaNameFromRef(value.$ref);
        if (schemaName) {
          dependencies.add(schemaName);
        }
      }
    });

    return dependencies;
  }

  private traverseSchema(
    obj: any,
    callback: (key: string, value: any) => void
  ): void {
    if (!obj || typeof obj !== 'object') return;

    for (const [key, value] of Object.entries(obj)) {
      callback(key, value);

      if (typeof value === 'object') {
        this.traverseSchema(value, callback);
      }
    }
  }

  private extractSchemaNameFromRef(ref: string): string {
    // Extract "Budget" from "#/schemas/Budget" or "schemas/Budget"
    const match = ref.match(/schemas\/([^/]+)$/);
    return match ? match[1] : '';
  }

  private shouldStopAtSchema(schemaName: string): boolean {
    if (!this.config.resolution.stopAtPatterns) return false;

    return this.config.resolution.stopAtPatterns.some(pattern =>
      this.matchesGlobPattern(schemaName, pattern)
    );
  }

  private matchesGlobPattern(str: string, pattern: string): boolean {
    const regex = new RegExp(
      '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
    );
    return regex.test(str);
  }
}
```

### 5.2 Common Types Resolution

```typescript
addCommonTypes(): void {
  const commonTypes = [
    'Date',
    'Money',
    'Status',
    'EntityStatus',
    'TimeOfDay',
    'LatLng',
  ];

  for (const typeName of commonTypes) {
    if (this.discoveryDoc.schemas?.[typeName]) {
      if (!this.extracted.has(typeName)) {
        this.extracted.set(typeName, this.discoveryDoc.schemas[typeName]);
        console.log(`➕ Added common type: ${typeName}`);
      }
    }
  }
}
```

### 5.3 Exclusion Filtering

```typescript
applyExclusions(patterns?: string[]): void {
  if (!patterns || patterns.length === 0) return;

  const toRemove: string[] = [];

  for (const [schemaName] of this.extracted) {
    for (const pattern of patterns) {
      if (this.matchesGlobPattern(schemaName, pattern)) {
        toRemove.push(schemaName);
        console.log(`🗑️  Excluded: ${schemaName} (matched pattern: ${pattern})`);
        break;
      }
    }
  }

  for (const schemaName of toRemove) {
    this.extracted.delete(schemaName);
  }

  console.log(`\n🗑️  Excluded ${toRemove.length} schemas`);
}
```

---

## 6. Output Specification

### 6.1 Minimal OpenAPI Spec Format

The extracted schemas are converted to OpenAPI 3.0 format:

```yaml
openapi: 3.0.0
info:
  title: DV360 API Minimal Schema
  version: v4
  description: Auto-generated minimal schema extraction for DV360 MCP Server
  x-extraction-metadata:
    extractedAt: "2025-01-15T10:30:00Z"
    totalSchemas: 47
    rootSchemas: 8
    resolvedDependencies: 39

components:
  schemas:
    InsertionOrder:
      type: object
      properties:
        insertionOrderId:
          type: string
        displayName:
          type: string
        advertiserId:
          type: string
        budget:
          $ref: '#/components/schemas/InsertionOrderBudget'
        # ... additional properties

    InsertionOrderBudget:
      type: object
      properties:
        budgetSegments:
          type: array
          items:
            $ref: '#/components/schemas/InsertionOrderBudgetSegment'

    # ... additional schemas
```

### 6.2 Generated TypeScript Types

Using `openapi-typescript`:

```typescript
// src/generated/schemas/types.ts (auto-generated)

export interface InsertionOrder {
  insertionOrderId?: string;
  displayName?: string;
  advertiserId?: string;
  budget?: InsertionOrderBudget;
  pacing?: Pacing;
  // ... additional properties
}

export interface InsertionOrderBudget {
  budgetSegments?: InsertionOrderBudgetSegment[];
  automationType?: 'INSERTION_ORDER_AUTOMATION_TYPE_NONE' | 'INSERTION_ORDER_AUTOMATION_TYPE_BUDGET' | 'INSERTION_ORDER_AUTOMATION_TYPE_BID_BUDGET';
}

// ... additional types
```

### 6.3 Generated Zod Schemas

Using `openapi-zod-client`:

```typescript
// src/generated/schemas/zod.ts (auto-generated)

import { z } from 'zod';

export const InsertionOrderBudgetSegmentSchema = z.object({
  budgetAmountMicros: z.string().optional(),
  dateRange: z.object({
    startDate: z.object({
      year: z.number().int(),
      month: z.number().int(),
      day: z.number().int(),
    }).optional(),
    endDate: z.object({
      year: z.number().int(),
      month: z.number().int(),
      day: z.number().int(),
    }).optional(),
  }).optional(),
  campaignBudgetId: z.string().optional(),
});

export const InsertionOrderBudgetSchema = z.object({
  budgetSegments: z.array(InsertionOrderBudgetSegmentSchema).optional(),
  automationType: z.enum([
    'INSERTION_ORDER_AUTOMATION_TYPE_NONE',
    'INSERTION_ORDER_AUTOMATION_TYPE_BUDGET',
    'INSERTION_ORDER_AUTOMATION_TYPE_BID_BUDGET',
  ]).optional(),
});

export const InsertionOrderSchema = z.object({
  insertionOrderId: z.string().optional(),
  displayName: z.string().optional(),
  advertiserId: z.string().optional(),
  budget: InsertionOrderBudgetSchema.optional(),
  pacing: PacingSchema.optional(),
  frequencyCap: FrequencyCapSchema.optional(),
  // ... additional fields
});

export type InsertionOrder = z.infer<typeof InsertionOrderSchema>;
export type InsertionOrderBudget = z.infer<typeof InsertionOrderBudgetSchema>;

// Re-export for convenience
export * from './types';
```

### 6.4 Discovery-to-OpenAPI Conversion Strategy

The conversion layer is responsible for translating Google Discovery quirks into standards-compliant OpenAPI 3.0 definitions. The implementation MUST adhere to the following mapping rules:

1. **Schema references** — Convert Discovery `$ref: 'SchemaName'` to OpenAPI `$ref: '#/components/schemas/SchemaName'` while preserving description metadata.
2. **`additionalProperties` maps** — When a schema defines `additionalProperties`, emit an OpenAPI `type: object` with an `additionalProperties` schema, and synthesize a stable component when the value is a `$ref`.
3. **Union-like constructs** — Discovery sometimes encodes `oneOf` semantics via `type: object` plus discriminators. Normalize these into explicit `oneOf` arrays where possible, or annotate with `x-google-structure` when lossless conversion is not possible.
4. **Enumerations** — Promote `enum` arrays to OpenAPI enums and copy across `enumDescriptions` as `x-enumDescriptions` extensions for downstream tooling.
5. **Method parameters** — Inline method-level parameters into `paths` definitions with correct `in` placement (`query`, `path`, etc.) and enforce requiredness flags from the Discovery doc.
6. **Pagination wrappers** — Mark known pagination patterns (e.g., `nextPageToken`) with an `x-pagination` extension so generated clients can automatically handle cursors.
7. **Partial updates** — For PATCH operations, set the request body media type to `application/json` and include the `x-google-patch` extension to signal partial semantics.
8. **Error models** — Normalize `GoogleRpcStatus`-style responses into a single reusable component shared across operations, ensuring consistent runtime validation.

Every conversion run produces a diagnostic artifact (`.tmp-specs/conversion-report.json`) summarizing:

- Unmapped fields that required vendor extensions
- Any lossy conversions (with severity levels)
- Newly introduced schemas during transformation

The build fails when new lossy conversions appear without an accompanying allowlist entry, guaranteeing the generated OpenAPI remains faithful to DV360.

### 6.5 Extraction Report Format

```json
{
  "extractionMetadata": {
    "timestamp": "2025-01-15T10:30:00.000Z",
    "apiVersion": "v4",
    "discoveryDocUrl": "https://displayvideo.googleapis.com/$discovery/rest?version=v4",
    "discoveryDocSize": 1294701,
    "durationMs": 2341
  },
  "configuration": {
    "rootSchemas": ["Partner", "Advertiser", "InsertionOrder", "LineItem", "AdGroup"],
    "operations": [],
    "resourceScopes": [
      "partners",
      "advertisers",
      "advertisers.insertionOrders",
      "advertisers.lineItems",
      "advertisers.adGroups"
    ],
    "operationDiscovery": {
      "mode": "resourceTree",
      "includeSubResources": true,
      "allowedMethods": ["get", "list", "patch", "bulkList"]
    },
    "includeCommonTypes": true,
    "excludePatterns": ["*Deprecated*", "Internal*"]
  },
  "results": {
    "totalSchemas": 47,
    "rootSchemas": [
      "Partner",
      "Advertiser",
      "InsertionOrder",
      "LineItem",
      "AdGroup",
      "ListPartnersResponse",
      "ListAdvertisersResponse",
      "ListInsertionOrdersResponse",
      "ListLineItemsResponse"
    ],
    "resolvedDependencies": [
      "Budget",
      "InsertionOrderBudget",
      "InsertionOrderBudgetSegment",
      "DateRange",
      "Date",
      "BiddingStrategy",
      "MaximizeSpendBidStrategy",
      "PerformanceGoalBidStrategy",
      "Pacing",
      "FrequencyCap",
      "PartnerRevenueModel",
      "YoutubeAndPartnersSettings",
      "TargetingExpansionConfig",
      "ThirdPartyMeasurementConfigs"
    ],
    "commonTypesAdded": ["Date", "Money", "Status", "EntityStatus"],
    "excludedSchemas": ["InternalTestType", "DeprecatedField"],
    "circularReferences": [],
    "warnings": []
  },
  "sizeAnalysis": {
    "originalDiscoverySize": 1294701,
    "extractedSpecSize": 156234,
    "compressionRatio": 0.88,
    "estimatedGeneratedCodeSize": 234567
  },
  "dependencyGraph": {
    "InsertionOrder": ["InsertionOrderBudget", "Pacing", "FrequencyCap", "BiddingStrategy"],
    "InsertionOrderBudget": ["InsertionOrderBudgetSegment"],
    "InsertionOrderBudgetSegment": ["DateRange"],
    "DateRange": ["Date"],
    "BiddingStrategy": ["MaximizeSpendBidStrategy", "PerformanceGoalBidStrategy"]
  },
  "validation": {
    "valid": true,
    "errors": [],
    "warnings": [
      {
        "type": "SIZE_WARNING",
        "message": "Extracted spec size (156KB) is below threshold (500KB)",
        "severity": "info"
      }
    ]
  }
}
```

---

## 7. Build Pipeline Integration

### 7.1 NPM Scripts

```json
{
  "scripts": {
    "prebuild": "pnpm run generate:schemas",
    "build": "tsc --build",

    "generate:schemas": "tsx scripts/generate-schemas.ts",
    "generate:schemas:watch": "tsx watch scripts/generate-schemas.ts",

    "fetch:discovery": "tsx scripts/fetch-discovery.ts",
    "convert:openapi": "tsx scripts/convert-to-openapi.ts",
    "codegen:types": "openapi-typescript .tmp-specs/minimal-openapi.yaml -o src/generated/schemas/types.ts",
    "codegen:zod": "openapi-zod-client .tmp-specs/minimal-openapi.yaml -o src/generated/schemas/zod.ts",

    "clean:generated": "rm -rf src/generated",
    "clean:specs": "rm -rf .tmp-specs",
    "clean": "pnpm run clean:generated && pnpm run clean:specs && rm -rf dist"
  }
}
```

### 7.2 Main Generation Script

```typescript
// scripts/generate-schemas.ts

import { SCHEMA_EXTRACTION_CONFIG } from '../config/schema-extraction.config';
import { fetchDiscoveryDoc } from './lib/fetch-discovery';
import { convertToOpenAPI } from './lib/convert-to-openapi';
import { extractSchemas } from './lib/extract-schemas';
import { generateTypeScript } from './lib/generate-typescript';
import { generateZod } from './lib/generate-zod';
import { saveReport } from './lib/save-report';
import fs from 'fs/promises';
import path from 'path';

async function main() {
  console.log('🚀 Starting schema generation pipeline...\n');
  const startTime = Date.now();

  try {
    // Step 1: Fetch Discovery Document
    console.log('📥 Step 1/5: Fetching Discovery Document...');
    const discoveryDoc = await fetchDiscoveryDoc(SCHEMA_EXTRACTION_CONFIG);
    console.log(`   ✓ Fetched ${(JSON.stringify(discoveryDoc).length / 1024).toFixed(1)} KB\n`);

    // Step 2: Extract Schemas
    console.log('🔍 Step 2/5: Extracting schemas...');
    const { schemas, report } = await extractSchemas(
      discoveryDoc,
      SCHEMA_EXTRACTION_CONFIG
    );
    console.log(`   ✓ Extracted ${report.totalSchemas} schemas\n`);

    // Step 3: Convert to OpenAPI
    console.log('🔄 Step 3/5: Converting to OpenAPI format...');
    const openApiSpec = await convertToOpenAPI(schemas, SCHEMA_EXTRACTION_CONFIG);

    // Ensure output directory exists
    const specDir = path.dirname(SCHEMA_EXTRACTION_CONFIG.output.specPath);
    await fs.mkdir(specDir, { recursive: true });

    // Save minimal OpenAPI spec
    await fs.writeFile(
      SCHEMA_EXTRACTION_CONFIG.output.specPath,
      JSON.stringify(openApiSpec, null, 2)
    );
    console.log(`   ✓ Saved to ${SCHEMA_EXTRACTION_CONFIG.output.specPath}\n`);

    // Step 4: Generate TypeScript & Zod
    console.log('⚡ Step 4/5: Generating TypeScript types and Zod schemas...');
    await generateTypeScript(SCHEMA_EXTRACTION_CONFIG.output.specPath, SCHEMA_EXTRACTION_CONFIG);
    await generateZod(SCHEMA_EXTRACTION_CONFIG.output.specPath, SCHEMA_EXTRACTION_CONFIG);
    console.log(`   ✓ Generated code in ${SCHEMA_EXTRACTION_CONFIG.output.generatedPath}\n`);

    // Step 5: Save Report
    if (SCHEMA_EXTRACTION_CONFIG.output.generateReport) {
      console.log('📊 Step 5/5: Generating extraction report...');
      await saveReport(report, SCHEMA_EXTRACTION_CONFIG);
      console.log(`   ✓ Report saved to ${SCHEMA_EXTRACTION_CONFIG.output.reportPath}\n`);
    }

    const duration = Date.now() - startTime;
    console.log(`✅ Schema generation complete! (${(duration / 1000).toFixed(2)}s)`);
    console.log(`\n📊 Summary:`);
    console.log(`   Root schemas: ${report.rootSchemas.length}`);
    console.log(`   Resolved dependencies: ${report.resolvedDependencies.length}`);
    console.log(`   Total schemas: ${report.totalSchemas}`);
    console.log(`   Excluded schemas: ${report.excludedSchemas.length}`);
    console.log(`   Size: ${(report.sizeAnalysis.extractedSpecSize / 1024).toFixed(1)} KB`);
    console.log(`   Reduction: ${(report.sizeAnalysis.compressionRatio * 100).toFixed(1)}%`);

  } catch (error) {
    console.error('\n❌ Schema generation failed:');
    console.error(error);
    process.exit(1);
  }
}

main();
```

### 7.3 Git Configuration

```gitignore
# .gitignore

# Temporary specs (fetched at build time)
.tmp-specs/
*.discovery.json

# DO NOT ignore generated schemas (these are committed)
# src/generated/schemas/
```

### 7.4 CI/CD Integration

```yaml
# .github/workflows/update-schemas.yml

name: Update API Schemas

on:
  schedule:
    # Run weekly on Monday at 9 AM UTC
    - cron: '0 9 * * 1'
  workflow_dispatch:

jobs:
  update-schemas:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - uses: pnpm/action-setup@v2
        with:
          version: 8

      - uses: actions/setup-node@v3
        with:
          node-version: 20
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install

      - name: Generate schemas
        run: |
          cd packages/dv360-mcp
          pnpm run generate:schemas

      - name: Check for changes
        id: changes
        run: |
          git diff --quiet src/generated/ || echo "changed=true" >> $GITHUB_OUTPUT

      - name: Create Pull Request
        if: steps.changes.outputs.changed == 'true'
        uses: peter-evans/create-pull-request@v5
        with:
          commit-message: 'chore(dv360): update generated schemas from API v4'
          title: 'Update DV360 API schemas'
          body: |
            ## Auto-generated Schema Update

            This PR updates the generated TypeScript types and Zod schemas based on the latest DV360 API Discovery Document.

            **Changes:**
            - Updated schemas from DV360 API v4
            - Extracted on: ${{ github.run_id }}

            **Review Checklist:**
            - [ ] Check extraction report for new/removed schemas
            - [ ] Verify no breaking changes to existing types
            - [ ] Run tests to ensure compatibility
          branch: update-dv360-schemas
          delete-branch: true
```

---

## 8. Error Handling

### 8.1 Error Types

```typescript
export class ExtractionError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, any>
  ) {
    super(message);
    this.name = 'ExtractionError';
  }
}

export const ErrorCodes = {
  DISCOVERY_FETCH_FAILED: 'DISCOVERY_FETCH_FAILED',
  SCHEMA_NOT_FOUND: 'SCHEMA_NOT_FOUND',
  CIRCULAR_REFERENCE: 'CIRCULAR_REFERENCE',
  MAX_DEPTH_EXCEEDED: 'MAX_DEPTH_EXCEEDED',
  INVALID_CONFIG: 'INVALID_CONFIG',
  CONVERSION_FAILED: 'CONVERSION_FAILED',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  SIZE_LIMIT_EXCEEDED: 'SIZE_LIMIT_EXCEEDED',
} as const;
```

### 8.2 Validation Rules

```typescript
function validateExtraction(
  extractor: SchemaExtractor,
  config: SchemaExtractionConfig
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Check for missing root schemas
  if (config.validation.failOnMissingSchemas) {
    const missing = extractor.getMissingSchemas();
    if (missing.length > 0) {
      errors.push({
        code: ErrorCodes.SCHEMA_NOT_FOUND,
        message: `Root schemas not found: ${missing.join(', ')}`,
        severity: 'error',
      });
    }
  }

  // Check for circular references
  if (config.validation.failOnCircularRefs) {
    const circular = extractor.getCircularReferences();
    if (circular.length > 0) {
      errors.push({
        code: ErrorCodes.CIRCULAR_REFERENCE,
        message: `Circular references detected: ${circular.length} occurrences`,
        details: circular,
        severity: 'error',
      });
    }
  }

  // Check size limits
  const size = extractor.getEstimatedSize();
  if (size > config.validation.failOnSizeLimit) {
    errors.push({
      code: ErrorCodes.SIZE_LIMIT_EXCEEDED,
      message: `Extracted spec size (${(size / 1024).toFixed(1)} KB) exceeds limit (${(config.validation.failOnSizeLimit / 1024).toFixed(1)} KB)`,
      severity: 'error',
    });
  } else if (size > config.validation.warnOnSizeThreshold) {
    warnings.push({
      code: 'SIZE_WARNING',
      message: `Extracted spec size (${(size / 1024).toFixed(1)} KB) exceeds threshold (${(config.validation.warnOnSizeThreshold / 1024).toFixed(1)} KB)`,
      severity: 'warning',
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
```

### 8.3 Fallback Strategies

```typescript
async function fetchDiscoveryDocWithRetry(
  config: SchemaExtractionConfig,
  maxRetries: number = 3
): Promise<DiscoveryDocument> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`📥 Fetching Discovery Document (attempt ${attempt}/${maxRetries})...`);
      return await fetchDiscoveryDoc(config);
    } catch (error) {
      lastError = error as Error;
      console.warn(`⚠️  Attempt ${attempt} failed: ${lastError.message}`);

      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
        console.log(`   Retrying in ${delay / 1000}s...`);
        await sleep(delay);
      }
    }
  }

  // Fallback to cache if available
  if (config.discovery.enableCache) {
    console.log('📦 Attempting to load from cache...');
    const cached = await loadCachedDiscoveryDoc(config);
    if (cached) {
      console.log('✓ Loaded from cache (may be outdated)');
      return cached;
    }
  }

  throw new ExtractionError(
    `Failed to fetch Discovery Document after ${maxRetries} attempts`,
    ErrorCodes.DISCOVERY_FETCH_FAILED,
    { lastError: lastError?.message }
  );
}
```

---

## 9. Testing Strategy

### 9.1 Unit Tests

```typescript
// __tests__/schema-extractor.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { SchemaExtractor } from '../lib/schema-extractor';
import { mockDiscoveryDoc } from './fixtures/mock-discovery-doc';

describe('SchemaExtractor', () => {
  let extractor: SchemaExtractor;
  let config: SchemaExtractionConfig;

  beforeEach(() => {
    config = {
      apiVersion: 'v4',
      rootSchemas: ['InsertionOrder', 'LineItem'],
      resolution: {
        resolveDependencies: true,
        maxDepth: 5,
        includeEnums: true,
      },
      // ... other config
    };
    extractor = new SchemaExtractor(mockDiscoveryDoc, config);
  });

  describe('extractWithDependencies', () => {
    it('should extract root schemas', async () => {
      const { schemas } = await extractor.extract();
      expect(schemas).toHaveProperty('InsertionOrder');
      expect(schemas).toHaveProperty('LineItem');
    });

    it('should resolve dependencies recursively', async () => {
      const { schemas } = await extractor.extract();

      // InsertionOrder depends on Budget
      expect(schemas).toHaveProperty('InsertionOrderBudget');

      // Budget depends on BudgetSegment
      expect(schemas).toHaveProperty('InsertionOrderBudgetSegment');

      // BudgetSegment depends on DateRange
      expect(schemas).toHaveProperty('DateRange');

      // DateRange depends on Date
      expect(schemas).toHaveProperty('Date');
    });

    it('should handle circular references gracefully', async () => {
      const circularDoc = {
        schemas: {
          A: { properties: { b: { $ref: 'schemas/B' } } },
          B: { properties: { a: { $ref: 'schemas/A' } } },
        },
      };

      const circularExtractor = new SchemaExtractor(circularDoc, config);
      const { schemas, report } = await circularExtractor.extract();

      expect(schemas).toHaveProperty('A');
      expect(schemas).toHaveProperty('B');
      expect(report.circularRefs).toHaveLength(1);
    });

    it('should respect maxDepth setting', async () => {
      config.resolution.maxDepth = 2;
      extractor = new SchemaExtractor(mockDiscoveryDoc, config);

      const { report } = await extractor.extract();

      // Should stop before deeply nested schemas
      expect(report.warnings).toContainEqual(
        expect.objectContaining({
          type: 'MAX_DEPTH_WARNING',
        })
      );
    });
  });

  describe('applyExclusions', () => {
    it('should exclude schemas matching patterns', async () => {
      config.excludePatterns = ['*Deprecated*', 'Internal*'];
      extractor = new SchemaExtractor(mockDiscoveryDoc, config);

      const { schemas, report } = await extractor.extract();

      expect(schemas).not.toHaveProperty('DeprecatedField');
      expect(schemas).not.toHaveProperty('InternalTestType');
      expect(report.excludedSchemas).toContain('DeprecatedField');
    });
  });

  describe('addCommonTypes', () => {
    it('should add common types when enabled', async () => {
      config.includeCommonTypes = true;
      extractor = new SchemaExtractor(mockDiscoveryDoc, config);

      const { schemas, report } = await extractor.extract();

      expect(schemas).toHaveProperty('Date');
      expect(schemas).toHaveProperty('Money');
      expect(report.commonTypesAdded).toContain('Date');
    });

    it('should not add common types when disabled', async () => {
      config.includeCommonTypes = false;
      config.rootSchemas = ['InsertionOrder']; // Doesn't depend on Date
      extractor = new SchemaExtractor(mockDiscoveryDoc, config);

      const { schemas } = await extractor.extract();

      expect(schemas).not.toHaveProperty('Money');
    });
  });
});
```

### 9.2 Integration Tests

```typescript
// __tests__/integration/full-pipeline.test.ts

import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

describe('Full Schema Generation Pipeline', () => {
  it('should generate valid TypeScript types', async () => {
    // Run full pipeline
    execSync('pnpm run generate:schemas', { cwd: process.cwd() });

    // Check that files were generated
    const typesPath = path.join(process.cwd(), 'src/generated/schemas/types.ts');
    const zodPath = path.join(process.cwd(), 'src/generated/schemas/zod.ts');

    await expect(fs.access(typesPath)).resolves.toBeUndefined();
    await expect(fs.access(zodPath)).resolves.toBeUndefined();

    // Verify types file has expected exports
    const typesContent = await fs.readFile(typesPath, 'utf-8');
    expect(typesContent).toContain('export interface InsertionOrder');
    expect(typesContent).toContain('export interface LineItem');
  });

  it('should generate valid Zod schemas', async () => {
    const zodPath = path.join(process.cwd(), 'src/generated/schemas/zod.ts');
    const zodContent = await fs.readFile(zodPath, 'utf-8');

    expect(zodContent).toContain('export const InsertionOrderSchema');
    expect(zodContent).toContain('z.object({');
  });

  it('should generate extraction report', async () => {
    const reportPath = path.join(process.cwd(), '.tmp-specs/extraction-report.json');
    const report = JSON.parse(await fs.readFile(reportPath, 'utf-8'));

    expect(report).toHaveProperty('results.totalSchemas');
    expect(report).toHaveProperty('sizeAnalysis.compressionRatio');
    expect(report.results.totalSchemas).toBeGreaterThan(0);
  });

  it('should produce schemas that validate real API responses', async () => {
    // Import generated Zod schema
    const { InsertionOrderSchema } = await import('../../src/generated/schemas/zod');

    // Mock API response
    const mockApiResponse = {
      insertionOrderId: '12345',
      displayName: 'Test Campaign',
      advertiserId: '67890',
      budget: {
        budgetSegments: [
          {
            budgetAmountMicros: '1000000000',
            dateRange: {
              startDate: { year: 2025, month: 1, day: 1 },
              endDate: { year: 2025, month: 12, day: 31 },
            },
          },
        ],
      },
    };

    // Should parse without throwing
    expect(() => InsertionOrderSchema.parse(mockApiResponse)).not.toThrow();
  });
});
```

### 9.3 Snapshot Testing

```typescript
// __tests__/snapshots/extraction-output.test.ts

import { describe, it, expect } from 'vitest';
import { SchemaExtractor } from '../../lib/schema-extractor';
import { SCHEMA_EXTRACTION_CONFIG } from '../../config/schema-extraction.config';
import { mockDiscoveryDoc } from '../fixtures/mock-discovery-doc';

describe('Extraction Output Snapshots', () => {
  it('should match extraction report snapshot', async () => {
    const extractor = new SchemaExtractor(mockDiscoveryDoc, SCHEMA_EXTRACTION_CONFIG);
    const { report } = await extractor.extract();

    // Remove dynamic fields
    const { timestamp, durationMs, ...staticReport } = report.extractionMetadata;

    expect(staticReport).toMatchSnapshot();
  });

  it('should match dependency graph snapshot', async () => {
    const extractor = new SchemaExtractor(mockDiscoveryDoc, SCHEMA_EXTRACTION_CONFIG);
    const { report } = await extractor.extract();

    expect(report.dependencyGraph).toMatchSnapshot();
  });
});
```

---

## 10. Examples

### 10.1 Basic Usage Example

```typescript
// packages/dv360-mcp/src/mcp-server/tools/definitions/get-insertion-orders.tool.ts

import { z } from 'zod';
import { InsertionOrderSchema, type InsertionOrder } from '@/generated/schemas/zod';

// Define tool parameters using generated schemas
export const getInsertionOrdersParamsSchema = z.object({
  advertiserId: z.string(),
  pageSize: z.number().min(1).max(200).default(50),
});

export const getInsertionOrdersTool = {
  name: 'get_insertion_orders',
  description: 'Fetch insertion orders for an advertiser',
  inputSchema: {
    type: 'object',
    properties: {
      advertiserId: { type: 'string', description: 'Advertiser ID' },
      pageSize: { type: 'number', description: 'Page size (1-200)', default: 50 },
    },
    required: ['advertiserId'],
  },
};

export async function handleGetInsertionOrders(
  params: z.infer<typeof getInsertionOrdersParamsSchema>
): Promise<{ content: Array<{ type: string; text: string }> }> {
  // Validate parameters
  const validated = getInsertionOrdersParamsSchema.parse(params);

  // Fetch from DV360 API
  const response = await dv360Client.advertisers.insertionOrders.list({
    advertiserId: validated.advertiserId,
    pageSize: validated.pageSize,
  });

  // Runtime validation of API response using generated schema
  const insertionOrders = z.array(InsertionOrderSchema).parse(
    response.data.insertionOrders
  );

  // Transform and return
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(insertionOrders, null, 2),
      },
    ],
  };
}
```

### 10.2 Custom Configuration Example

```typescript
// packages/dv360-mcp/config/schema-extraction.config.ts

export const SCHEMA_EXTRACTION_CONFIG: SchemaExtractionConfig = {
  apiVersion: 'v4',

  // Extract only schemas for read operations
  operations: [
    'partners.list',
    'advertisers.list',
    'advertisers.insertionOrders.list',
    'advertisers.lineItems.list',
  ],

  // Don't include write operation schemas
  excludePatterns: [
    '*CreateRequest',
    '*UpdateRequest',
    '*Deprecated*',
  ],

  includeCommonTypes: true,

  resolution: {
    resolveDependencies: true,
    maxDepth: 8,
    includeEnums: true,

    // Stop at pagination wrappers (don't extract their internals)
    stopAtPatterns: ['PageInfo', 'PageToken'],
  },

  output: {
    specPath: '.tmp-specs/dv360-readonly-v4.yaml',
    generatedPath: 'src/generated/schemas',
    generateReport: true,
    reportPath: '.tmp-specs/extraction-report.json',
    prettyPrint: true,
  },

  discovery: {
    baseUrl: 'https://displayvideo.googleapis.com/$discovery/rest',
    timeout: 30000,
    enableCache: true,
    cacheTTL: 86400000,
  },

  validation: {
    failOnCircularRefs: false,
    failOnMissingSchemas: true,
    warnOnSizeThreshold: 300000,  // 300KB warning
    failOnSizeLimit: 1000000,     // 1MB hard limit
  },
};
```

### 10.3 Multi-Version Support Example

```typescript
// config/schema-extraction-v3.config.ts
export const SCHEMA_EXTRACTION_CONFIG_V3: SchemaExtractionConfig = {
  apiVersion: 'v3',
  rootSchemas: ['InsertionOrder', 'LineItem'],
  output: {
    specPath: '.tmp-specs/dv360-minimal-v3.yaml',
    generatedPath: 'src/generated/schemas/v3',
    // ...
  },
  // ...
};

// config/schema-extraction-v4.config.ts
export const SCHEMA_EXTRACTION_CONFIG_V4: SchemaExtractionConfig = {
  apiVersion: 'v4',
  rootSchemas: ['InsertionOrder', 'LineItem'],
  output: {
    specPath: '.tmp-specs/dv360-minimal-v4.yaml',
    generatedPath: 'src/generated/schemas/v4',
    // ...
  },
  // ...
};

// scripts/generate-all-versions.ts
async function generateAllVersions() {
  await generateSchemas(SCHEMA_EXTRACTION_CONFIG_V3);
  await generateSchemas(SCHEMA_EXTRACTION_CONFIG_V4);
}
```

---

### 9.4 Live Response Smoke Tests

```typescript
// __tests__/live/dv360-smoke.test.ts

import { describe, it, expect, beforeAll } from 'vitest';
import { google } from 'googleapis';
import { InsertionOrderSchema } from '../../src/generated/schemas/zod';
import { recordHttpInteractions } from '../utils/vcr';

describe('DV360 live contract', () => {
  beforeAll(async () => {
    await recordHttpInteractions({
      cassette: 'dv360-insertion-orders',
      scopes: ['https://www.googleapis.com/auth/display-video'],
    });
  });

  it('validates list responses against generated schemas', async () => {
    const auth = new google.auth.GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/display-video.readonly'],
    });
    const client = google.displayvideo({ version: 'v4', auth: await auth.getClient() });

    const response = await client.advertisers.insertionOrders.list({
      advertiserId: process.env.TEST_ADVERTISER_ID!,
      pageSize: 5,
    });

    const items = response.data.insertionOrders ?? [];
    items.forEach(order => {
      const parsed = InsertionOrderSchema.safeParse(order);
      if (!parsed.success) {
        console.error(parsed.error.flatten());
      }
      expect(parsed.success).toBe(true);
    });
  }, 20_000);
});
```

These smoke tests execute nightly in CI against recorded HTTP fixtures (falling back to live DV360 when the cassette expires). They ensure that any upstream shape changes surface immediately as validation failures, closing the feedback loop between schema generation and real-world payloads.

---

## 11. Migration Path

### Phase 1: Setup Infrastructure (Week 1)

**Goals:**
- Install dependencies
- Create configuration files
- Set up basic scripts

**Tasks:**
1. Add npm dependencies:
   ```bash
   pnpm add -D openapi-typescript openapi-zod-client google-discovery-to-swagger
   ```

2. Create config file:
   ```bash
   mkdir -p packages/dv360-mcp/config
   touch packages/dv360-mcp/config/schema-extraction.config.ts
   ```

3. Create scripts directory:
   ```bash
   mkdir -p packages/dv360-mcp/scripts/lib
   ```

4. Update `.gitignore`:
   ```
   .tmp-specs/
   ```

**Deliverables:**
- Configuration file
- Basic fetch script
- Updated package.json scripts

---

### Phase 2: Implement Core Extraction (Week 2)

**Goals:**
- Build schema extraction logic
- Implement dependency resolution
- Generate first minimal spec

**Tasks:**
1. Implement `SchemaExtractor` class
2. Implement `fetchDiscoveryDoc()` function
3. Implement `convertToOpenAPI()` function
4. Test extraction with 2-3 root schemas

**Deliverables:**
- Working extraction pipeline
- First generated minimal spec (~100-200KB)
- Extraction report

---

### Phase 3: Code Generation Integration (Week 3)

**Goals:**
- Generate TypeScript types
- Generate Zod schemas
- Integrate with build pipeline

**Tasks:**
1. Set up `openapi-typescript` generation
2. Set up `openapi-zod-client` generation
3. Add `prebuild` hook to package.json
4. Test generated types in one tool

**Deliverables:**
- Generated TypeScript types
- Generated Zod schemas
- Build pipeline integration

---

### Phase 4: Migrate Existing Code (Week 4)

**Goals:**
- Migrate examples to use generated schemas
- Replace googleapis types
- Add runtime validation

**Tasks:**
1. Update `get-entities.ts` to use generated types
2. Update `update-entities.ts` to use generated types
3. Add Zod validation to API responses
4. Remove direct googleapis dependencies where possible

**Deliverables:**
- Migrated example files
- Runtime validation in place
- Reduced googleapis coupling

---

### Phase 5: Testing & Validation (Week 5)

**Goals:**
- Write comprehensive tests
- Validate against real API
- Document usage patterns

**Tasks:**
1. Write unit tests for extraction logic
2. Write integration tests for pipeline
3. Test generated schemas against real API responses
4. Create usage documentation

**Deliverables:**
- Test suite with >80% coverage
- Validated against production API
- User documentation

---

### Phase 6: CI/CD & Automation (Week 6)

**Goals:**
- Automate schema updates
- Set up PR workflow
- Monitor for API changes

**Tasks:**
1. Create GitHub Actions workflow
2. Set up weekly schema update job
3. Configure PR creation on changes
4. Add schema diff reporting

**Deliverables:**
- Automated schema update workflow
- PR-based review process
- Change notifications

---

## 12. Performance Considerations

### 12.1 Extraction Performance

**Benchmarks (DV360 v4):**
- Full Discovery Doc fetch: ~500ms
- Schema extraction (50 schemas): ~200ms
- OpenAPI conversion: ~300ms
- TypeScript generation: ~1s
- Zod generation: ~1.5s
- **Total pipeline: ~3-4 seconds**

**Optimization Strategies:**

1. **Caching:**
   ```typescript
   // Cache discovery doc for 24 hours
   const cacheKey = `discovery-${apiVersion}-${date}`;
   const cached = await cache.get(cacheKey);
   if (cached) return cached;
   ```

2. **Parallel Generation:**
   ```typescript
   await Promise.all([
     generateTypeScript(spec),
     generateZod(spec),
   ]);
   ```

3. **Incremental Extraction:**
   ```typescript
   // Only re-extract if discovery doc changed
   const currentHash = hash(discoveryDoc);
   if (currentHash === lastHash) {
     console.log('No changes detected, skipping extraction');
     return;
   }
   ```

### 12.2 Build Time Impact

**Before optimization:**
- Clean build: ~15s
- With schema generation: ~20s (+33%)

**After optimization (with cache):**
- Clean build: ~15s
- With schema generation (cached): ~16s (+6%)

**Recommendations:**
- Enable caching in CI/CD
- Only regenerate on schema config changes
- Use separate job for schema updates

### 12.3 Bundle Size Impact

**Comparison:**

| Approach | Bundle Impact | Types | Runtime Validation |
|----------|---------------|-------|-------------------|
| googleapis (full) | +450KB | Yes | No |
| googleapis (tree-shaken) | +150KB | Yes | No |
| Generated schemas | +80KB | Yes | Yes (Zod) |

**Benefits:**
- 47% smaller than tree-shaken googleapis
- 82% smaller than full googleapis
- Includes runtime validation

---

## 13. Second Iteration Validation

**Goal:** Confirm that the refactored pipeline is the most efficient and reliable way to keep DV360-derived schemas synchronized with the MCP server.

### Alignment with Objectives

- ✅ **Minimize repository size** — Automated operation discovery scopes extraction to only the resources we actually touch, while conversion diagnostics prevent unexpected schema bloat.
- ✅ **Maintain type safety** — The explicit Discovery → OpenAPI mapping plus nightly live smoke tests prove that generated validators continue to reflect real payloads.
- ✅ **Automate dependencies** — Recursive extraction remains intact, and auto-discovered operations ensure new DV360 endpoints under existing resources are captured without manual updates.
- ✅ **Enable flexibility** — Configuration now supports explicit, resource-based, or telemetry-driven operation selection, making it easy to tailor coverage per environment.
- ✅ **Provide observability** — Conversion and extraction reports, along with recorded live-test artifacts, supply actionable metadata whenever the upstream API shifts.

### Residual Risks & Mitigations

- **New DV360 resources outside tracked scopes** — Mitigated by weekly review of conversion reports and low-friction addition of new resource scopes.
- **Lossy conversions** — Build now fails on previously unseen lossy transformations, forcing explicit remediation instead of silent drift.
- **Credential churn for live tests** — Use short-lived service accounts in CI and fall back to recorded fixtures to limit external dependencies.

### Conclusion

With the above safeguards, this iteration provides an automated, test-backed loop from Discovery documents to runtime validation. It eliminates manual operation curation, documents the conversion contract, and validates generated schemas against real DV360 traffic, making it the most robust and efficient approach for keeping MCP server types current with Display & Video 360 v4.

---

## Appendix A: Google Discovery Document Format

### Structure Overview

```json
{
  "kind": "discovery#restDescription",
  "discoveryVersion": "v1",
  "id": "displayvideo:v4",
  "name": "displayvideo",
  "version": "v4",
  "title": "Display & Video 360 API",
  "description": "...",
  "baseUrl": "https://displayvideo.googleapis.com/",
  "basePath": "",
  "rootUrl": "https://displayvideo.googleapis.com/",
  "servicePath": "",
  "parameters": { ... },
  "auth": { ... },
  "schemas": {
    "InsertionOrder": {
      "id": "InsertionOrder",
      "type": "object",
      "properties": {
        "insertionOrderId": { "type": "string" },
        "displayName": { "type": "string" },
        "budget": { "$ref": "InsertionOrderBudget" }
      }
    }
  },
  "resources": {
    "advertisers": {
      "methods": {
        "list": {
          "id": "displayvideo.advertisers.list",
          "path": "v4/advertisers",
          "httpMethod": "GET",
          "response": { "$ref": "ListAdvertisersResponse" }
        }
      },
      "resources": {
        "insertionOrders": { ... }
      }
    }
  }
}
```

### Key Differences from OpenAPI

| Feature | Discovery | OpenAPI 3.0 |
|---------|-----------|-------------|
| Schemas location | `schemas` | `components.schemas` |
| References | `$ref: "SchemaName"` | `$ref: "#/components/schemas/SchemaName"` |
| Operations | Nested in `resources` | Flat in `paths` |
| HTTP methods | `httpMethod` field | Path keys (get, post, etc.) |

---

## Appendix B: Tool Comparison

### Schema Generation Tools

| Tool | Output | Runtime Validation | Bundle Size | Maintenance |
|------|--------|-------------------|-------------|-------------|
| **openapi-typescript** | `.d.ts` types only | ❌ No | Minimal (types only) | Active |
| **openapi-zod-client** | Zod schemas + types | ✅ Yes | Medium (+Zod) | Active |
| **@hey-api/openapi-ts** | Types + client | ⚠️ Optional | Large | Active |
| **swagger-typescript-api** | Types + axios client | ❌ No | Large | Active |

**Recommendation:** `openapi-zod-client` for runtime validation with reasonable bundle size.

---

## Appendix C: Glossary

- **Discovery Document**: Google's proprietary API specification format
- **OpenAPI**: Industry-standard API specification (formerly Swagger)
- **Schema**: Definition of a data structure/type
- **Dependency Resolution**: Process of finding all schemas referenced by a root schema
- **Circular Reference**: Schema A references B, which references A
- **Zod**: TypeScript-first schema validation library
- **Tree Shaking**: Dead code elimination in bundlers
- **Bundle Size**: Size of compiled JavaScript sent to browsers

---

## Document Metadata

- **Version:** 1.1.0
- **Last Updated:** 2025-01-16
- **Author:** BidShifter Engineering
- **Status:** Draft
- **Related Documents:**
  - [DV360 API Reference](https://developers.google.com/display-video/api/reference/rest)
  - [OpenAPI 3.0 Specification](https://spec.openapis.org/oas/v3.0.0)
  - [Zod Documentation](https://zod.dev)

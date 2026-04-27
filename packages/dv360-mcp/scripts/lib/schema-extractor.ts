/**
 * Schema Extractor - Core extraction algorithm
 *
 * Extracts minimal schemas from Discovery Documents with dependency resolution,
 * circular reference detection, and exclusion pattern support.
 */

import { minimatch } from "minimatch";
import {
  DiscoveryDocument,
  DiscoverySchema,
  ExtractionResult,
  ExtractionReport,
  CircularReference,
  ExtractionWarning,
  ErrorCodes,
  ExtractionError,
} from "./types.js";
import type { SchemaExtractionConfig } from "../../config/schema-extraction.config.js";

/**
 * Common types that should be automatically included if found
 */
const COMMON_TYPES = [
  "Date",
  "Money",
  "Status",
  "EntityStatus",
  "TimeOfDay",
  "LatLng",
  "Dimensions",
  "FrequencyCap",
];

/**
 * Schema Extractor
 *
 * Extracts a minimal set of schemas from a Discovery Document based on root schemas
 * and automatically resolves all dependencies.
 */
export class SchemaExtractor {
  private readonly discoveryDoc: DiscoveryDocument;
  private readonly config: SchemaExtractionConfig;

  // Extraction state
  private extractedSchemas: Map<string, DiscoverySchema> = new Map();
  private visited: Set<string> = new Set();
  private dependencyGraph: Map<string, Set<string>> = new Map();
  private circularRefs: CircularReference[] = [];
  private warnings: ExtractionWarning[] = [];

  // Tracking
  private rootSchemasExtracted: string[] = [];
  private commonTypesAdded: string[] = [];
  private excludedSchemas: string[] = [];
  private startTime: number = 0;

  constructor(discoveryDoc: DiscoveryDocument, config: SchemaExtractionConfig) {
    this.discoveryDoc = discoveryDoc;
    this.config = config;
  }

  /**
   * Main extraction entry point
   *
   * Extracts root schemas and all their dependencies, applies exclusions,
   * and generates a detailed report.
   */
  async extract(): Promise<ExtractionResult> {
    this.startTime = Date.now();

    console.log("🔍 Extracting schemas...");
    console.log(`   Root schemas: ${this.config.rootSchemas.length}`);

    // Step 1: Extract root schemas
    for (const schemaName of this.config.rootSchemas) {
      try {
        await this.extractRecursive(schemaName, []);
        this.rootSchemasExtracted.push(schemaName);
      } catch (error: any) {
        if (this.config.validation.failOnMissingSchemas) {
          throw error;
        }
        this.warnings.push({
          type: "MISSING_ROOT_SCHEMA",
          message: `Root schema "${schemaName}" not found in Discovery document`,
          severity: "warning",
          details: { schemaName },
        });
      }
    }

    // Step 2: Add common types (if enabled)
    if (this.config.includeCommonTypes) {
      this.addCommonTypes();
    }

    // Step 3: Apply exclusions
    this.applyExclusions();

    // Step 4: Validate circular references
    if (this.circularRefs.length > 0 && this.config.validation.failOnCircularRefs) {
      throw new ExtractionError(
        `Circular references detected: ${this.circularRefs.length}`,
        ErrorCodes.CIRCULAR_REFERENCE,
        {
          circularReferences: this.circularRefs,
        }
      );
    }

    // Step 5: Generate report
    const report = this.generateReport();

    console.log(`   ✓ Extracted ${this.extractedSchemas.size} schemas`);
    console.log(`     - Root: ${this.rootSchemasExtracted.length}`);
    console.log(`     - Dependencies: ${report.results.resolvedDependencies.length}`);
    console.log(`     - Common types: ${this.commonTypesAdded.length}`);
    if (this.excludedSchemas.length > 0) {
      console.log(`     - Excluded: ${this.excludedSchemas.length}`);
    }
    if (this.circularRefs.length > 0) {
      console.log(`     ⚠️  Circular references: ${this.circularRefs.length}`);
    }

    return {
      schemas: Object.fromEntries(this.extractedSchemas),
      report,
    };
  }

  /**
   * Recursively extract a schema and all its dependencies
   *
   * @param schemaName - Name of schema to extract
   * @param path - Current extraction path (for circular reference detection)
   * @param currentDepth - Current recursion depth
   */
  private async extractRecursive(
    schemaName: string,
    path: string[],
    currentDepth: number = 0
  ): Promise<void> {
    // Check if already extracted
    if (this.extractedSchemas.has(schemaName)) {
      return;
    }

    // Check for circular reference
    if (path.includes(schemaName)) {
      this.circularRefs.push({
        path: [...path, schemaName],
        message: `Circular reference detected: ${[...path, schemaName].join(" -> ")}`,
      });
      return;
    }

    // Check max depth
    if (currentDepth >= this.config.resolution.maxDepth) {
      this.warnings.push({
        type: "MAX_DEPTH_EXCEEDED",
        message: `Max depth ${this.config.resolution.maxDepth} reached at ${schemaName}`,
        severity: "warning",
        details: {
          schemaName,
          depth: currentDepth,
          path: [...path, schemaName],
        },
      });
      return;
    }

    // Get schema from Discovery document
    const schema = this.discoveryDoc.schemas[schemaName];
    if (!schema) {
      throw new ExtractionError(
        `Schema "${schemaName}" not found in Discovery document`,
        ErrorCodes.SCHEMA_NOT_FOUND,
        {
          schemaName,
          availableSchemas: Object.keys(this.discoveryDoc.schemas).slice(0, 10),
          totalSchemas: Object.keys(this.discoveryDoc.schemas).length,
        }
      );
    }

    // Mark as visited
    this.visited.add(schemaName);

    // Extract schema
    this.extractedSchemas.set(schemaName, schema);

    // Find dependencies
    const dependencies = this.findDependencies(schema);

    // Record dependency graph
    this.dependencyGraph.set(schemaName, new Set(dependencies));

    // Recursively extract dependencies
    const newPath = [...path, schemaName];
    for (const depName of dependencies) {
      await this.extractRecursive(depName, newPath, currentDepth + 1);
    }
  }

  /**
   * Find all schema dependencies (via $ref)
   *
   * Walks the schema tree to find all referenced schemas.
   */
  private findDependencies(schema: DiscoverySchema): string[] {
    const dependencies = new Set<string>();

    const walkSchema = (obj: any) => {
      if (!obj || typeof obj !== "object") {
        return;
      }

      // Check for $ref
      if (obj.$ref && typeof obj.$ref === "string") {
        const refName = this.parseSchemaRef(obj.$ref);
        dependencies.add(refName);
      }

      // Recursively walk properties
      if (obj.properties) {
        for (const prop of Object.values(obj.properties)) {
          walkSchema(prop);
        }
      }

      // Walk additionalProperties
      if (obj.additionalProperties) {
        walkSchema(obj.additionalProperties);
      }

      // Walk items (for arrays)
      if (obj.items) {
        walkSchema(obj.items);
      }

      // Walk nested schemas in oneOf, anyOf, allOf
      if (obj.oneOf) {
        for (const item of obj.oneOf) {
          walkSchema(item);
        }
      }
      if (obj.anyOf) {
        for (const item of obj.anyOf) {
          walkSchema(item);
        }
      }
      if (obj.allOf) {
        for (const item of obj.allOf) {
          walkSchema(item);
        }
      }
    };

    walkSchema(schema);

    return Array.from(dependencies);
  }

  /**
   * Parse schema reference to extract schema name
   *
   * Discovery refs are just schema names (no prefix)
   * e.g., "Budget" not "#/components/schemas/Budget"
   */
  private parseSchemaRef(ref: string): string {
    // Discovery format: just the schema name
    // Handle edge case where someone might use OpenAPI format
    if (ref.startsWith("#/")) {
      const parts = ref.split("/");
      return parts[parts.length - 1];
    }
    return ref;
  }

  /**
   * Add common primitive types automatically
   *
   * Types like Date, Money, Status are used frequently and should be included
   * if they exist in the Discovery document.
   */
  private addCommonTypes(): void {
    for (const typeName of COMMON_TYPES) {
      if (this.discoveryDoc.schemas[typeName] && !this.extractedSchemas.has(typeName)) {
        this.extractedSchemas.set(typeName, this.discoveryDoc.schemas[typeName]);
        this.commonTypesAdded.push(typeName);

        // Also add dependencies of common types
        const dependencies = this.findDependencies(this.discoveryDoc.schemas[typeName]);
        this.dependencyGraph.set(typeName, new Set(dependencies));

        for (const depName of dependencies) {
          if (!this.extractedSchemas.has(depName) && this.discoveryDoc.schemas[depName]) {
            this.extractedSchemas.set(depName, this.discoveryDoc.schemas[depName]);
          }
        }
      }
    }

    if (this.commonTypesAdded.length > 0) {
      console.log(`   Added common types: ${this.commonTypesAdded.join(", ")}`);
    }
  }

  /**
   * Apply exclusion patterns to remove unwanted schemas
   *
   * Uses minimatch for glob pattern matching.
   */
  private applyExclusions(): void {
    if (!this.config.excludePatterns || this.config.excludePatterns.length === 0) {
      return;
    }

    const schemasToRemove: string[] = [];

    for (const [schemaName] of this.extractedSchemas) {
      for (const pattern of this.config.excludePatterns) {
        if (minimatch(schemaName, pattern)) {
          schemasToRemove.push(schemaName);
          break;
        }
      }
    }

    for (const schemaName of schemasToRemove) {
      this.extractedSchemas.delete(schemaName);
      this.excludedSchemas.push(schemaName);
    }

    if (schemasToRemove.length > 0) {
      console.log(`   Excluded ${schemasToRemove.length} schemas matching patterns`);
    }
  }

  /**
   * Generate detailed extraction report
   */
  private generateReport(): ExtractionReport {
    const durationMs = Date.now() - this.startTime;

    // Calculate resolved dependencies (non-root schemas)
    const resolvedDependencies = Array.from(this.extractedSchemas.keys())
      .filter((name) => !this.rootSchemasExtracted.includes(name))
      .filter((name) => !this.commonTypesAdded.includes(name));

    // Build dependency graph as plain object
    const dependencyGraph: Record<string, string[]> = {};
    for (const [schema, deps] of this.dependencyGraph) {
      dependencyGraph[schema] = Array.from(deps);
    }

    // Calculate size analysis
    const originalDiscoverySize = JSON.stringify(this.discoveryDoc).length;
    const extractedSpecSize = JSON.stringify(Object.fromEntries(this.extractedSchemas)).length;

    return {
      extractionMetadata: {
        timestamp: new Date().toISOString(),
        apiVersion: this.config.apiVersion,
        discoveryDocUrl: `${this.config.discovery.baseUrl}?version=${this.config.apiVersion}`,
        discoveryDocSize: originalDiscoverySize,
        durationMs,
      },
      configuration: {
        rootSchemas: this.config.rootSchemas,
        includeCommonTypes: this.config.includeCommonTypes,
        excludePatterns: this.config.excludePatterns,
        resolutionMaxDepth: this.config.resolution.maxDepth,
      },
      results: {
        totalSchemas: this.extractedSchemas.size,
        rootSchemas: this.rootSchemasExtracted,
        resolvedDependencies,
        commonTypesAdded: this.commonTypesAdded,
        excludedSchemas: this.excludedSchemas,
        circularReferences: this.circularRefs,
        warnings: this.warnings,
      },
      sizeAnalysis: {
        originalDiscoverySize,
        extractedSpecSize,
        compressionRatio: 1 - extractedSpecSize / originalDiscoverySize,
        estimatedGeneratedCodeSize: extractedSpecSize * 2, // Rough estimate
      },
      dependencyGraph,
      validation: {
        valid: this.circularRefs.length === 0 || !this.config.validation.failOnCircularRefs,
        errors: this.circularRefs.map((ref) => ({
          code: "CIRCULAR_REFERENCE",
          message: ref.message,
          severity: "error" as const,
          details: { path: ref.path },
        })),
        warnings: this.warnings.map((w) => ({
          code: w.type,
          message: w.message,
          severity: w.severity,
          details: w.details,
        })),
      },
    };
  }
}

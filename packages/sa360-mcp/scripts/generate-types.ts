#!/usr/bin/env tsx
// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * SA360 Type Generation Script
 *
 * Fetches the Search Ads 360 Reporting API v0 Discovery Document,
 * converts it to OpenAPI 3.0 format, then runs openapi-typescript
 * to generate TypeScript types at src/generated/types.ts.
 *
 * Usage:
 *   pnpm run generate
 */

import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(__dirname, "..");

const DISCOVERY_URL = "https://searchads360.googleapis.com/$discovery/rest?version=v0";
const OPENAPI_SPEC_PATH = path.join(PACKAGE_ROOT, "src", "generated", "openapi.json");
const TYPES_OUTPUT_PATH = path.join(PACKAGE_ROOT, "src", "generated", "types.ts");

// ---------------------------------------------------------------------------
// Discovery Doc fetch
// ---------------------------------------------------------------------------

async function fetchDiscoveryDoc(): Promise<Record<string, unknown>> {
  console.log(`Fetching Discovery Document from:\n  ${DISCOVERY_URL}`);
  const res = await fetch(DISCOVERY_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch Discovery Document: ${res.status} ${res.statusText}`);
  }
  const doc = (await res.json()) as Record<string, unknown>;
  const schemaCount = Object.keys((doc.schemas as Record<string, unknown>) ?? {}).length;
  console.log(`Fetched Discovery Document — ${schemaCount} schemas found.`);
  return doc;
}

// ---------------------------------------------------------------------------
// Discovery Doc → OpenAPI 3.0 conversion
// ---------------------------------------------------------------------------

/**
 * Convert a single Discovery Doc schema object into an OpenAPI 3.0 schema
 * object, normalising Google-specific fields along the way.
 */
function convertDiscoverySchema(schema: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  // Passthrough description
  if (schema.description) {
    result.description = schema.description;
  }

  // Handle $ref — Discovery format: "#/SchemaName", OpenAPI: "#/components/schemas/SchemaName"
  if (schema.$ref) {
    result.$ref = `#/components/schemas/${schema.$ref}`;
    return result;
  }

  // Handle explicit type
  const type = schema.type as string | undefined;

  if (type === "object" || schema.properties) {
    result.type = "object";

    const props = schema.properties as Record<string, Record<string, unknown>> | undefined;

    if (props) {
      const converted: Record<string, unknown> = {};
      for (const [propName, propSchema] of Object.entries(props)) {
        converted[propName] = convertDiscoverySchema(propSchema);
      }
      result.properties = converted;
    }

    if (schema.additionalProperties) {
      const addlProps = schema.additionalProperties as Record<string, unknown>;
      result.additionalProperties = convertDiscoverySchema(addlProps);
    }
  } else if (type === "array") {
    result.type = "array";
    if (schema.items) {
      result.items = convertDiscoverySchema(schema.items as Record<string, unknown>);
    }
  } else if (type) {
    // Primitive — map Google types to OpenAPI types
    result.type = mapGoogleTypeToPrimitive(type);

    // Preserve format hints (e.g. "int64", "date-time", "byte")
    if (schema.format) {
      result.format = schema.format;
    }
  }

  // Enum values
  if (schema.enum) {
    result.enum = schema.enum;
  }
  if (schema.enumDescriptions) {
    result["x-enumDescriptions"] = schema.enumDescriptions;
  }

  // readOnly / deprecated hints
  if (schema.readOnly) {
    result.readOnly = schema.readOnly;
  }

  return result;
}

/**
 * Map Google Discovery Doc primitive type strings to OpenAPI 3.0 primitives.
 */
function mapGoogleTypeToPrimitive(googleType: string): string {
  switch (googleType) {
    case "integer":
      return "integer";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "string":
      return "string";
    case "any":
      return "object"; // best-effort
    default:
      return "string";
  }
}

/**
 * Convert the full Discovery Doc into a minimal OpenAPI 3.0 document
 * containing only the schemas component (paths left empty — we only
 * need the types).
 */
function convertDiscoveryToOpenApi(discoveryDoc: Record<string, unknown>): Record<string, unknown> {
  const schemas: Record<string, unknown> = {};
  const discoverySchemas = (discoveryDoc.schemas as Record<string, Record<string, unknown>>) ?? {};

  for (const [name, schema] of Object.entries(discoverySchemas)) {
    schemas[name] = convertDiscoverySchema(schema);
  }

  const title = (discoveryDoc.title as string) ?? "Search Ads 360 API";
  const version = (discoveryDoc.version as string) ?? "v0";

  return {
    openapi: "3.0.0",
    info: { title, version },
    paths: {},
    components: { schemas },
  };
}

// ---------------------------------------------------------------------------
// File helpers
// ---------------------------------------------------------------------------

async function ensureDirectory(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

// ---------------------------------------------------------------------------
// Legacy type appendix
// ---------------------------------------------------------------------------

/**
 * Hand-authored types for the SA360 Legacy v2 API (DoubleClick Search).
 * These are appended verbatim after the generated types because the v2 API
 * has no machine-readable spec.
 */
const LEGACY_TYPES_APPENDIX = `
// =============================================================================
// LEGACY TYPES — SA360 v2 API (DoubleClick Search)
// Used exclusively for offline conversion upload via:
//   POST https://www.googleapis.com/doubleclicksearch/v2/conversion
// =============================================================================

/**
 * A single offline conversion record for SA360 v2 upload.
 *
 * Required fields: conversionId, conversionTimestamp, segmentationType,
 * segmentationId, quantityMillis, customerId.
 */
export interface SA360Conversion {
  /** Unique identifier for this conversion (deduplication key). */
  conversionId: string;
  /** Unix timestamp of the conversion in milliseconds (as string). */
  conversionTimestamp: string;
  /** The segmentation type. Typically "FLOODLIGHT". */
  segmentationType: string;
  /** The Floodlight activity ID associated with this conversion. */
  segmentationId: string;
  /** Number of conversions, expressed in milli-units (1000 = 1 conversion). */
  quantityMillis: number;
  /** Revenue amount in micro-units of the specified currency (optional). */
  revenueMicros?: string;
  /** ISO 4217 currency code for revenueMicros (optional, e.g. "USD"). */
  currencyCode?: string;
  /** SA360 customer ID (without hyphens). */
  customerId: string;
  /** SA360 campaign ID (optional). */
  campaignId?: string;
  /** SA360 ad group ID (optional). */
  adGroupId?: string;
  /** SA360 keyword/criterion ID (optional). */
  criterionId?: string;
  /** SA360 ad ID (optional). */
  adId?: string;
}

/**
 * Request body for the SA360 v2 conversion upload endpoint.
 * POST https://www.googleapis.com/doubleclicksearch/v2/conversion
 */
export interface SA360ConversionUploadRequest {
  /** Fixed value identifying the resource type. */
  kind: "doubleclicksearch#conversionList";
  /** The list of conversions to upload. */
  conversions: SA360Conversion[];
}
`;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const startTime = Date.now();

  try {
    // Step 1: Fetch Discovery Document
    console.log("\nStep 1/4: Fetching SA360 Reporting API v0 Discovery Document...");
    const discoveryDoc = await fetchDiscoveryDoc();

    // Step 2: Convert to OpenAPI 3.0
    console.log("\nStep 2/4: Converting Discovery Document to OpenAPI 3.0...");
    const openApiSpec = convertDiscoveryToOpenApi(discoveryDoc);
    const schemaCount = Object.keys(
      (openApiSpec.components as Record<string, unknown>)?.schemas as Record<string, unknown>
    ).length;
    console.log(`  Converted ${schemaCount} schemas.`);

    // Step 3: Write intermediate OpenAPI JSON (required by openapi-typescript CLI)
    console.log("\nStep 3/4: Writing intermediate OpenAPI spec...");
    await ensureDirectory(path.dirname(OPENAPI_SPEC_PATH));
    await fs.writeFile(OPENAPI_SPEC_PATH, JSON.stringify(openApiSpec, null, 2), "utf-8");
    const specSizeKB = Math.round((await fs.stat(OPENAPI_SPEC_PATH)).size / 1024);
    console.log(
      `  Written to ${path.relative(PACKAGE_ROOT, OPENAPI_SPEC_PATH)} (${specSizeKB} KB)`
    );

    // Step 4: Generate TypeScript types via openapi-typescript CLI
    console.log("\nStep 4/4: Generating TypeScript types via openapi-typescript...");
    await ensureDirectory(path.dirname(TYPES_OUTPUT_PATH));

    try {
      execSync(`npx openapi-typescript "${OPENAPI_SPEC_PATH}" -o "${TYPES_OUTPUT_PATH}"`, {
        cwd: PACKAGE_ROOT,
        stdio: "inherit",
      });
    } catch (err: unknown) {
      throw new Error(
        `openapi-typescript failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    // Append legacy v2 types to the generated file
    await fs.appendFile(TYPES_OUTPUT_PATH, LEGACY_TYPES_APPENDIX, "utf-8");
    console.log(
      `  Appended legacy SA360 v2 types to ${path.relative(PACKAGE_ROOT, TYPES_OUTPUT_PATH)}`
    );

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\nDone in ${elapsed}s.`);
    console.log(`  Types: ${path.relative(PACKAGE_ROOT, TYPES_OUTPUT_PATH)}`);
    console.log(`  Spec:  ${path.relative(PACKAGE_ROOT, OPENAPI_SPEC_PATH)}`);
    console.log("");
  } catch (err: unknown) {
    console.error("\nGeneration failed:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();

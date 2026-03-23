#!/usr/bin/env node
/**
 * CM360 Type Generation Script
 *
 * Fetches Google Campaign Manager 360 API v5 Discovery Document and generates
 * TypeScript types using openapi-typescript.
 *
 * Pipeline:
 * 1. Fetch CM360 API v5 Discovery Document
 * 2. Convert Discovery Doc schemas to OpenAPI 3.0 format
 * 3. Save OpenAPI spec to temp file
 * 4. Run openapi-typescript to generate types.ts
 * 5. Clean up temp spec file
 */

import { execSync } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(__dirname, '..');
const DISCOVERY_URL = 'https://www.googleapis.com/discovery/v1/apis/dfareporting/v5/rest';
const GENERATED_DIR = path.join(PACKAGE_ROOT, 'src', 'generated');
const SPEC_PATH = path.join(GENERATED_DIR, 'cm360-openapi.json');
const TYPES_PATH = path.join(GENERATED_DIR, 'types.ts');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DiscoveryProperty {
  type?: string;
  description?: string;
  format?: string;
  $ref?: string;
  items?: DiscoveryProperty;
  properties?: Record<string, DiscoveryProperty>;
  additionalProperties?: DiscoveryProperty | boolean;
  enum?: string[];
  enumDescriptions?: string[];
  pattern?: string;
  minimum?: string | number;
  maximum?: string | number;
  repeated?: boolean;
  deprecated?: boolean;
  // Discovery-specific fields we intentionally skip
  annotations?: unknown;
  id?: string;
  required?: boolean;
}

interface DiscoverySchema extends DiscoveryProperty {
  id?: string;
  type?: string;
  properties?: Record<string, DiscoveryProperty>;
}

interface DiscoveryDocument {
  name: string;
  version: string;
  title?: string;
  description?: string;
  schemas: Record<string, DiscoverySchema>;
}

interface OpenAPIProperty {
  type?: string;
  description?: string;
  format?: string;
  $ref?: string;
  items?: OpenAPIProperty;
  properties?: Record<string, OpenAPIProperty>;
  additionalProperties?: OpenAPIProperty | boolean;
  enum?: string[];
  'x-enumDescriptions'?: string[];
  pattern?: string;
  minimum?: string | number;
  maximum?: string | number;
  deprecated?: boolean;
}

interface OpenAPISchema extends OpenAPIProperty {
  required?: string[];
}

interface OpenAPISpec {
  openapi: '3.0.0';
  info: {
    title: string;
    version: string;
    description?: string;
  };
  paths: Record<string, never>;
  components: {
    schemas: Record<string, OpenAPISchema>;
  };
}

// ---------------------------------------------------------------------------
// Discovery Doc fetch (with retry)
// ---------------------------------------------------------------------------

async function fetchDiscoveryDoc(): Promise<DiscoveryDocument> {
  const maxRetries = 3;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`  Fetching from: ${DISCOVERY_URL}`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30_000);

      try {
        const response = await fetch(DISCOVERY_URL, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = (await response.json()) as unknown;

        if (
          typeof data !== 'object' ||
          data === null ||
          !('schemas' in data) ||
          typeof (data as Record<string, unknown>).schemas !== 'object'
        ) {
          throw new Error('Invalid Discovery document: missing or invalid schemas field');
        }

        return data as DiscoveryDocument;
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const msg = lastError.name === 'AbortError' ? 'Request timed out after 30s' : lastError.message;
      console.warn(`  Attempt ${attempt}/${maxRetries} failed: ${msg}`);

      if (attempt < maxRetries) {
        const delayMs = Math.pow(2, attempt) * 1_000;
        console.log(`  Retrying in ${delayMs / 1_000}s...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw new Error(
    `Failed to fetch Discovery Document after ${maxRetries} attempts: ${lastError?.message}`
  );
}

// ---------------------------------------------------------------------------
// Discovery Doc → OpenAPI 3.0 conversion
// ---------------------------------------------------------------------------

/**
 * Convert a Discovery $ref ("SchemaName") to OpenAPI $ref ("#/components/schemas/SchemaName").
 * If already in OpenAPI format, return as-is.
 */
function convertRef(ref: string): string {
  if (ref.startsWith('#/')) {
    return ref;
  }
  return `#/components/schemas/${ref}`;
}

/**
 * Convert a single Discovery property/schema node to an OpenAPI property.
 * Handles: type, description, format, $ref, items, properties,
 * additionalProperties, enum, pattern, minimum, maximum, deprecated.
 * Skips Discovery-specific fields: id, annotations, required (property-level).
 * Expands "repeated: true" into array wrappers.
 */
function convertProperty(prop: DiscoveryProperty): OpenAPIProperty {
  // Discovery "repeated" means the field is an array of this type
  if (prop.repeated) {
    const inner = convertProperty({ ...prop, repeated: false });
    return { type: 'array', items: inner };
  }

  const out: OpenAPIProperty = {};

  if (prop.type !== undefined) out.type = prop.type;
  if (prop.description !== undefined) out.description = prop.description;
  if (prop.format !== undefined) out.format = prop.format;
  if (prop.pattern !== undefined) out.pattern = prop.pattern;
  if (prop.minimum !== undefined) out.minimum = prop.minimum;
  if (prop.maximum !== undefined) out.maximum = prop.maximum;
  if (prop.deprecated) out.deprecated = prop.deprecated;

  if (prop.$ref !== undefined) {
    out.$ref = convertRef(prop.$ref);
  }

  if (prop.enum !== undefined) {
    out.enum = prop.enum;
    if (prop.enumDescriptions !== undefined) {
      out['x-enumDescriptions'] = prop.enumDescriptions;
    }
  }

  if (prop.properties !== undefined) {
    out.properties = {};
    for (const [name, child] of Object.entries(prop.properties)) {
      out.properties[name] = convertProperty(child);
    }
  }

  if (prop.additionalProperties !== undefined) {
    if (typeof prop.additionalProperties === 'object') {
      out.additionalProperties = convertProperty(prop.additionalProperties);
    } else {
      out.additionalProperties = prop.additionalProperties;
    }
  }

  if (prop.items !== undefined) {
    out.items = convertProperty(prop.items);
  }

  // Intentionally skipped: id, annotations, required (property-level)

  return out;
}

/**
 * Convert a top-level Discovery schema entry to an OpenAPI schema.
 * In addition to property fields, OpenAPI schemas may have a "required" array.
 * Discovery marks individual properties with "required: true" — we collect those
 * and hoist them onto the parent schema.
 */
function convertSchema(schema: DiscoverySchema): OpenAPISchema {
  const out: OpenAPISchema = convertProperty(schema);

  // Hoist property-level "required: true" into the parent's required array
  if (schema.properties) {
    const requiredFields: string[] = [];
    for (const [name, prop] of Object.entries(schema.properties)) {
      if (prop.required === true) {
        requiredFields.push(name);
      }
    }
    if (requiredFields.length > 0) {
      out.required = requiredFields;
    }
  }

  return out;
}

/**
 * Convert a full Discovery Document to an OpenAPI 3.0 specification.
 * All schemas from the Discovery Doc are included; no filtering is applied
 * so callers have the full type surface available.
 */
function convertDiscoveryToOpenApi(discoveryDoc: DiscoveryDocument): OpenAPISpec {
  const schemas: Record<string, OpenAPISchema> = {};

  for (const [name, schema] of Object.entries(discoveryDoc.schemas)) {
    schemas[name] = convertSchema(schema);
  }

  return {
    openapi: '3.0.0',
    info: {
      title: discoveryDoc.title ?? `${discoveryDoc.name} API`,
      version: discoveryDoc.version,
      description: discoveryDoc.description,
    },
    paths: {},
    components: {
      schemas,
    },
  };
}

// ---------------------------------------------------------------------------
// File system helpers
// ---------------------------------------------------------------------------

async function ensureDirectory(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const startTime = Date.now();
  console.log('Starting CM360 type generation pipeline...\n');

  // Step 1: Fetch Discovery Document
  console.log('Step 1/4: Fetching CM360 API v5 Discovery Document...');
  const discoveryDoc = await fetchDiscoveryDoc();
  const schemaCount = Object.keys(discoveryDoc.schemas).length;
  console.log(`  Fetched ${schemaCount} schemas from Discovery Doc\n`);

  // Step 2: Convert to OpenAPI 3.0
  console.log('Step 2/4: Converting to OpenAPI 3.0...');
  const openApiSpec = convertDiscoveryToOpenApi(discoveryDoc);
  console.log(`  Converted ${Object.keys(openApiSpec.components.schemas).length} schemas\n`);

  // Step 3: Save temp OpenAPI spec
  console.log('Step 3/4: Saving OpenAPI spec and generating TypeScript types...');
  await ensureDirectory(GENERATED_DIR);
  await fs.writeFile(SPEC_PATH, JSON.stringify(openApiSpec, null, 2), 'utf-8');

  // Step 4: Run openapi-typescript
  try {
    execSync(`npx openapi-typescript "${SPEC_PATH}" -o "${TYPES_PATH}"`, {
      cwd: PACKAGE_ROOT,
      stdio: 'inherit',
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`openapi-typescript failed: ${msg}`);
  }

  // Cleanup temp spec
  try {
    await fs.unlink(SPEC_PATH);
    console.log('\n  Cleaned up temp spec file');
  } catch {
    // Non-fatal — file may not exist if openapi-typescript errored before write
  }

  const elapsedSec = ((Date.now() - startTime) / 1_000).toFixed(2);
  console.log(`\nDone in ${elapsedSec}s`);
  console.log(`Generated: src/generated/types.ts`);
}

main().catch((error: unknown) => {
  const msg = error instanceof Error ? error.message : String(error);
  console.error(`\nError: ${msg}`);
  if (error instanceof Error && error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});

/**
 * Zod Schema Generator
 *
 * Generates standalone Zod validation schemas from OpenAPI 3.0 schemas.
 * This is a Phase 1 implementation focused on schema-only generation.
 */

import { OpenAPISpec, OpenAPISchema, OpenAPIProperty } from './types.js';

/**
 * Generate Zod schemas from OpenAPI specification
 *
 * @param spec - OpenAPI 3.0 specification
 * @returns TypeScript code with Zod schemas
 */
export function generateZodSchemas(spec: OpenAPISpec): string {
  const lines: string[] = [];

  // Header
  lines.push(`/**`);
  lines.push(` * Auto-generated Zod schemas from OpenAPI specification`);
  lines.push(` * Generated at: ${new Date().toISOString()}`);
  lines.push(` * DO NOT EDIT MANUALLY`);
  lines.push(` */`);
  lines.push('');
  lines.push(`import { z } from 'zod';`);
  lines.push('');

  // Generate schema for each component
  const schemas = spec.components.schemas;
  const schemaNames = Object.keys(schemas);

  // First pass: Generate all schemas (may have circular refs, so use z.lazy)
  for (const schemaName of schemaNames) {
    const schema = schemas[schemaName];
    const zodSchema = generateSchemaDefinition(schemaName, schema, schemas);
    lines.push(zodSchema);
    lines.push('');
  }

  // Export all schemas as a single object for convenience
  // Note: Explicit type annotation avoids TS7056 "inferred type exceeds maximum length" error
  lines.push('/**');
  lines.push(' * All schemas exported as a single object');
  lines.push(' */');
  lines.push('export const schemas: Record<string, z.ZodTypeAny> = {');
  for (const schemaName of schemaNames) {
    lines.push(`  ${schemaName},`);
  }
  lines.push('};');

  return lines.join('\n');
}

/**
 * Generate Zod schema definition for a single schema
 */
function generateSchemaDefinition(
  schemaName: string,
  schema: OpenAPISchema,
  allSchemas: Record<string, OpenAPISchema>
): string {
  const lines: string[] = [];

  // Add JSDoc comment with description
  if (schema.description) {
    lines.push('/**');
    lines.push(` * ${schema.description.replace(/\n/g, '\n * ')}`);
    lines.push(' */');
  }

  const zodType = convertSchemaToZod(schema, allSchemas, 0);
  lines.push(`export const ${schemaName} = ${zodType};`);

  return lines.join('\n');
}

/**
 * Convert OpenAPI schema to Zod schema string
 */
function convertSchemaToZod(
  schema: OpenAPISchema | OpenAPIProperty,
  allSchemas: Record<string, OpenAPISchema>,
  depth: number
): string {
  // Handle $ref
  if (schema.$ref) {
    const refName = schema.$ref.split('/').pop()!;
    // Use z.lazy for potential circular references
    return `z.lazy(() => ${refName})`;
  }

  // Handle type-based conversion
  switch (schema.type) {
    case 'object':
      return convertObjectToZod(schema, allSchemas, depth);

    case 'array':
      return convertArrayToZod(schema, allSchemas, depth);

    case 'string':
      return convertStringToZod(schema);

    case 'number':
    case 'integer':
      return convertNumberToZod(schema);

    case 'boolean':
      return 'z.boolean()';

    case 'null':
      return 'z.null()';

    default:
      // If no type specified, use unknown
      if (!schema.type && !schema.properties && !schema.items) {
        return 'z.unknown()';
      }
      // If has properties but no type, assume object
      if (schema.properties) {
        return convertObjectToZod(schema, allSchemas, depth);
      }
      return 'z.unknown()';
  }
}

/**
 * Convert object schema to Zod
 */
function convertObjectToZod(
  schema: OpenAPISchema | OpenAPIProperty,
  allSchemas: Record<string, OpenAPISchema>,
  depth: number
): string {
  if (!schema.properties || Object.keys(schema.properties).length === 0) {
    // Empty object or object with additionalProperties
    if (schema.additionalProperties) {
      if (typeof schema.additionalProperties === 'boolean') {
        return schema.additionalProperties ? 'z.record(z.unknown())' : 'z.object({})';
      } else {
        const valueSchema = convertSchemaToZod(schema.additionalProperties, allSchemas, depth + 1);
        return `z.record(${valueSchema})`;
      }
    }
    return 'z.object({})';
  }

  const indent = '  '.repeat(depth + 1);
  const lines: string[] = ['z.object({'];

  for (const [propName, propSchema] of Object.entries(schema.properties)) {
    const propZod = convertSchemaToZod(propSchema, allSchemas, depth + 1);
    const isRequired = schema.required?.includes(propName);

    let propLine = `${indent}${propName}: ${propZod}`;

    // Add optional if not required
    if (!isRequired) {
      propLine += '.optional()';
    }

    // Add description as comment
    if (propSchema.description) {
      const comment = propSchema.description.replace(/\n/g, ' ').substring(0, 80);
      propLine = `${indent}/** ${comment} */\n${propLine}`;
    }

    lines.push(propLine + ',');
  }

  lines.push('  '.repeat(depth) + '})');

  return lines.join('\n');
}

/**
 * Convert array schema to Zod
 */
function convertArrayToZod(
  schema: OpenAPISchema | OpenAPIProperty,
  allSchemas: Record<string, OpenAPISchema>,
  depth: number
): string {
  if (!schema.items) {
    return 'z.array(z.unknown())';
  }

  const itemSchema = convertSchemaToZod(schema.items, allSchemas, depth);
  return `z.array(${itemSchema})`;
}

/**
 * Convert string schema to Zod
 */
function convertStringToZod(schema: OpenAPISchema | OpenAPIProperty): string {
  let zodSchema = 'z.string()';

  // Handle enum
  if (schema.enum && schema.enum.length > 0) {
    const enumValues = schema.enum.map(v => `"${v}"`).join(', ');
    return `z.enum([${enumValues}])`;
  }

  // Handle format
  if (schema.format) {
    switch (schema.format) {
      case 'email':
        zodSchema += '.email()';
        break;
      case 'uri':
      case 'url':
        zodSchema += '.url()';
        break;
      case 'uuid':
        zodSchema += '.uuid()';
        break;
      case 'date':
      case 'date-time':
      case 'google-datetime':
        // Keep as string, could add regex validation
        break;
      case 'int64':
      case 'int32':
        // OpenAPI uses string for int64, but we keep as string in Zod
        break;
    }
  }

  // Handle pattern
  if (schema.pattern) {
    zodSchema += `.regex(/${schema.pattern}/)`;
  }

  return zodSchema;
}

/**
 * Convert number schema to Zod
 */
function convertNumberToZod(schema: OpenAPISchema | OpenAPIProperty): string {
  let zodSchema = schema.type === 'integer' ? 'z.number().int()' : 'z.number()';

  if (schema.minimum !== undefined) {
    zodSchema += `.min(${schema.minimum})`;
  }

  if (schema.maximum !== undefined) {
    zodSchema += `.max(${schema.maximum})`;
  }

  return zodSchema;
}

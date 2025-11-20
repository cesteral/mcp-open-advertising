#!/usr/bin/env node

/**
 * Schema Size Validation Test
 *
 * Ensures that all MCP tool schemas stay under stdio transport size limits.
 * This prevents EPIPE errors when using stdio transport (e.g., Claude Desktop).
 *
 * Background:
 * - Stdio transport has message size limits (~1MB practical limit)
 * - Full discriminated union schemas exceeded this, causing EPIPE errors
 * - We now use simplified schemas for tool registration
 * - This test validates schemas stay under safe limits
 */

const path = require("path");
const { zodToJsonSchema } = require("zod-to-json-schema");

// Size limits (in bytes)
const STDIO_SAFE_LIMIT = 100_000; // 100KB - safe for stdio
const STDIO_WARNING_LIMIT = 50_000; // 50KB - warning threshold
const STDIO_HARD_LIMIT = 1_000_000; // 1MB - hard limit (will cause EPIPE)

console.log("📏 Testing MCP Tool Schema Sizes\n");
console.log(`Safe Limit:    ${STDIO_SAFE_LIMIT.toLocaleString()} bytes (100KB)`);
console.log(`Warning Limit: ${STDIO_WARNING_LIMIT.toLocaleString()} bytes (50KB)`);
console.log(`Hard Limit:    ${STDIO_HARD_LIMIT.toLocaleString()} bytes (1MB)\n`);

let allTestsPassed = true;

/**
 * Test a schema's size
 */
async function testSchemaSize(schemaName, schemaGetter) {
  try {
    const schema = await schemaGetter();

    // Convert Zod schema to JSON Schema (this is what gets transmitted)
    let jsonSchema;
    if (schema._def) {
      // It's a Zod schema
      jsonSchema = zodToJsonSchema(schema);
    } else {
      // Already JSON Schema
      jsonSchema = schema;
    }

    const size = JSON.stringify(jsonSchema).length;

    // Determine status
    let status = "✅";
    let message = "PASS";

    if (size > STDIO_SAFE_LIMIT) {
      status = "❌";
      message = "FAIL - Exceeds safe limit";
      allTestsPassed = false;
    } else if (size > STDIO_WARNING_LIMIT) {
      status = "⚠️";
      message = "WARNING - Approaching limit";
    }

    const sizeKB = (size / 1024).toFixed(2);
    const percentOfLimit = ((size / STDIO_SAFE_LIMIT) * 100).toFixed(1);

    console.log(`${status} ${schemaName}`);
    console.log(`   Size: ${size.toLocaleString()} bytes (${sizeKB} KB)`);
    console.log(`   Limit: ${percentOfLimit}% of safe limit`);
    console.log(`   Status: ${message}\n`);

    return { schemaName, size, status: message, passed: size <= STDIO_SAFE_LIMIT };
  } catch (error) {
    console.error(`❌ ${schemaName}`);
    console.error(`   Error: ${error.message}\n`);
    allTestsPassed = false;
    return { schemaName, error: error.message, passed: false };
  }
}

/**
 * Load and test all tool schemas
 */
async function testAllSchemas() {
  console.log("Loading schemas...\n");

  // Add reflect-metadata polyfill before any imports that need it
  await import("reflect-metadata");

  // Dynamically import the tool definitions
  // Note: We use dynamic import to handle ES modules from CJS test
  const createEntityModule = await import(
    "../dist/mcp-server/tools/definitions/create-entity.tool.js"
  );
  const updateEntityModule = await import(
    "../dist/mcp-server/tools/definitions/update-entity.tool.js"
  );
  const listEntitiesModule = await import(
    "../dist/mcp-server/tools/definitions/list-entities.tool.js"
  );
  const getEntityModule = await import("../dist/mcp-server/tools/definitions/get-entity.tool.js");
  const deleteEntityModule = await import(
    "../dist/mcp-server/tools/definitions/delete-entity.tool.js"
  );

  const results = [];

  // Test create_entity tool schema
  results.push(
    await testSchemaSize(
      "dv360_create_entity (CreateEntityInputSchema)",
      async () => createEntityModule.CreateEntityInputSchema
    )
  );

  // Test update_entity tool schema
  results.push(
    await testSchemaSize(
      "dv360_update_entity (UpdateEntityInputSchema)",
      async () => updateEntityModule.UpdateEntityInputSchema
    )
  );

  // Test list_entities tool schema
  results.push(
    await testSchemaSize(
      "dv360_list_entities (ListEntitiesInputSchema)",
      async () => listEntitiesModule.ListEntitiesInputSchema
    )
  );

  // Test get_entity tool schema
  results.push(
    await testSchemaSize(
      "dv360_get_entity (GetEntityInputSchema)",
      async () => getEntityModule.GetEntityInputSchema
    )
  );

  // Test delete_entity tool schema
  results.push(
    await testSchemaSize(
      "dv360_delete_entity (DeleteEntityInputSchema)",
      async () => deleteEntityModule.DeleteEntityInputSchema
    )
  );

  // Test simplified schema utilities
  const simplifiedSchemasModule = await import(
    "../dist/mcp-server/tools/utils/simplified-schemas.js"
  );

  results.push(
    await testSchemaSize("Simplified Create Entity Schema (JSON)", async () =>
      simplifiedSchemasModule.getSimplifiedCreateEntitySchema()
    )
  );

  results.push(
    await testSchemaSize("Simplified Update Entity Schema (JSON)", async () =>
      simplifiedSchemasModule.getSimplifiedUpdateEntitySchema()
    )
  );

  return results;
}

/**
 * Print summary report
 */
function printSummary(results) {
  console.log("=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const total = results.length;

  console.log(`Total schemas tested: ${total}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}\n`);

  if (allTestsPassed) {
    console.log("✅ All schemas are within safe size limits!\n");
  } else {
    console.log("❌ Some schemas exceed safe size limits.\n");
    console.log("Action required:");
    console.log("1. Review large schemas and consider simplification");
    console.log("2. Use MCP Resources for detailed schema information");
    console.log("3. Consider entity-specific tools if schemas grow too large\n");
  }

  // Show largest schemas
  const sortedBySized = results
    .filter((r) => r.size)
    .sort((a, b) => b.size - a.size)
    .slice(0, 3);

  if (sortedBySized.length > 0) {
    console.log("Largest schemas:");
    sortedBySized.forEach((r, i) => {
      const sizeKB = (r.size / 1024).toFixed(2);
      console.log(`${i + 1}. ${r.schemaName}: ${sizeKB} KB`);
    });
    console.log();
  }
}

/**
 * Main test runner
 */
async function main() {
  try {
    // Check if dist directory exists
    const distPath = path.join(__dirname, "..", "dist");
    const fs = require("fs");

    if (!fs.existsSync(distPath)) {
      console.error("❌ Error: dist/ directory not found.");
      console.error("Please run `pnpm run build` first.\n");
      process.exit(1);
    }

    const results = await testAllSchemas();
    printSummary(results);

    process.exit(allTestsPassed ? 0 : 1);
  } catch (error) {
    console.error("❌ Test execution failed:");
    console.error(error);
    process.exit(1);
  }
}

// Run tests
main();

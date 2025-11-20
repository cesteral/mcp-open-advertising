/**
 * Demo script to test MCP resources
 * Run with: npx tsx src/mcp-server/resources/demo-resources.ts
 */

import { resourceRegistry } from "./utils/resource-registry.js";
import { allResources } from "./definitions/index.js";

async function demoResources() {
  console.log("🎯 DV360 MCP - Resources Demo\n");

  // Register all resources
  resourceRegistry.registerAll();

  console.log(`📋 1. Registered Resources: ${resourceRegistry.getResourceCount()}\n`);

  // List all resources
  console.log("🔍 2. Available Resource Types:\n");
  for (const resource of allResources) {
    console.log(`  - ${resource.name}`);
    console.log(`    URI Template: ${resource.uriTemplate}`);
    console.log(`    Description: ${resource.description}`);
    console.log();
  }

  // Test entity-schema resource
  console.log("📦 3. Testing entity-schema resource:\n");
  const schemaMatch = resourceRegistry.findResourceByUri("entity-schema://lineItem");
  if (schemaMatch) {
    console.log(`  ✓ Matched resource: ${schemaMatch.resource.name}`);
    console.log(`  ✓ Extracted params:`, schemaMatch.params);

    try {
      const schemaContent = await schemaMatch.resource.read(schemaMatch.params);
      const schemaData = JSON.parse(schemaContent.text);
      console.log(`  ✓ Entity Type: ${schemaData.entityType}`);
      console.log(`  ✓ Required Fields: ${schemaData.metadata.requiredFields.length}`);
      console.log(`  ✓ Supported Operations:`, schemaData.metadata.supportedOperations);
    } catch (error) {
      console.error(`  ✗ Error reading schema:`, error);
    }
  }
  console.log();

  // Test entity-fields resource
  console.log("📝 4. Testing entity-fields resource:\n");
  const fieldsMatch = resourceRegistry.findResourceByUri("entity-fields://campaign");
  if (fieldsMatch) {
    console.log(`  ✓ Matched resource: ${fieldsMatch.resource.name}`);
    console.log(`  ✓ Extracted params:`, fieldsMatch.params);

    try {
      const fieldsContent = await fieldsMatch.resource.read(fieldsMatch.params);
      const fieldsData = JSON.parse(fieldsContent.text);
      console.log(`  ✓ Entity Type: ${fieldsData.entityType}`);
      console.log(`  ✓ Total Fields: ${fieldsData.fieldCount}`);
      console.log(`  ✓ Common Update Masks:`, fieldsData.commonUpdateMasks.slice(0, 3));
    } catch (error) {
      console.error(`  ✗ Error reading fields:`, error);
    }
  }
  console.log();

  // Test entity-examples resource
  console.log("📚 5. Testing entity-examples resource:\n");
  const examplesMatch = resourceRegistry.findResourceByUri("entity-examples://lineItem");
  if (examplesMatch) {
    console.log(`  ✓ Matched resource: ${examplesMatch.resource.name}`);
    console.log(`  ✓ Extracted params:`, examplesMatch.params);

    try {
      const examplesContent = await examplesMatch.resource.read(examplesMatch.params);
      const examplesData = JSON.parse(examplesContent.text);
      console.log(`  ✓ Entity Type: ${examplesData.entityType}`);
      console.log(`  ✓ Total Examples: ${examplesData.exampleCount}`);
      console.log(`  ✓ Categories:`, examplesData.categories);
      console.log(
        `  ✓ Example Operations:`,
        examplesData.examples.map((ex: any) => ex.operation).slice(0, 3)
      );
    } catch (error) {
      console.error(`  ✗ Error reading examples:`, error);
    }
  }
  console.log();

  // Test list functionality
  console.log("📑 6. Testing list functionality:\n");
  const schemaResource = allResources.find((r) => r.uriTemplate === "entity-schema://{entityType}");
  if (schemaResource && schemaResource.list) {
    try {
      const listItems = await schemaResource.list();
      console.log(`  ✓ Found ${listItems.length} entity schemas`);
      console.log(
        `  ✓ First 5 schemas:`,
        listItems.slice(0, 5).map((item) => item.name)
      );
    } catch (error) {
      console.error(`  ✗ Error listing schemas:`, error);
    }
  }
  console.log();

  // Test error handling
  console.log("⚠️  7. Testing error handling:\n");
  const invalidMatch = resourceRegistry.findResourceByUri("entity-schema://invalidEntity");
  if (invalidMatch) {
    try {
      await invalidMatch.resource.read(invalidMatch.params);
      console.log(`  ✗ Should have thrown an error for invalid entity type`);
    } catch (error) {
      console.log(`  ✓ Correctly threw error for invalid entity:`, (error as Error).message);
    }
  }
  console.log();

  console.log("✅ Resources Demo Complete!\n");
}

// Run the demo
demoResources().catch((error) => {
  console.error("❌ Demo failed:", error);
  process.exit(1);
});

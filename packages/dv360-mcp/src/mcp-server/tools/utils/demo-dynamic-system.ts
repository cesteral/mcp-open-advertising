#!/usr/bin/env tsx
/**
 * Demo script showcasing the dynamic entity system
 * Run with: npx tsx src/mcp-server/tools/utils/demo-dynamic-system.ts
 */

import {
  getAvailableEntitySchemas,
  extractFieldsFromSchema,
  extractRequiredFields,
  hasGeneratedSchema,
  getCommonUpdateMasks,
} from "./schema-introspection.js";
import {
  getAllEntityConfigs,
  getSupportedEntityTypesDynamic,
  discoverNewEntities,
  suggestApiMetadata,
  getRequiredFieldsFromSchema,
} from "./entity-mapping-dynamic.js";

console.log("🎯 DV360 MCP - Dynamic Entity System Demo\n");
console.log("=".repeat(60));

// 1. Auto-discover available entities
console.log("\n📋 1. Auto-Discovered Entity Schemas:");
console.log("-".repeat(60));
const schemas = getAvailableEntitySchemas();
console.log(`Found ${schemas.size} entity schemas:`);
for (const [entityType] of schemas.entries()) {
  const hasSchema = hasGeneratedSchema(entityType);
  console.log(`  - ${entityType.padEnd(20)} ${hasSchema ? "✅" : "⚠️  (fallback)"}`);
}

// 2. Show supported entity types (with API metadata)
console.log("\n🔧 2. Supported Entity Types (with API config):");
console.log("-".repeat(60));
const supportedTypes = getSupportedEntityTypesDynamic();
console.log(`${supportedTypes.length} entities configured:`);
supportedTypes.forEach((type) => {
  console.log(`  - ${type}`);
});

// 3. Show full entity configurations
console.log("\n⚙️  3. Entity Configurations (auto-built):");
console.log("-".repeat(60));
const configs = getAllEntityConfigs();
const sampleEntity = "lineItem";
const config = configs.get(sampleEntity);
if (config) {
  console.log(`\nConfiguration for '${sampleEntity}':`);
  console.log(JSON.stringify(config, null, 2));
}

// 4. Extract field information
console.log("\n📝 4. Field Introspection:");
console.log("-".repeat(60));
const lineItemSchema = schemas.get("lineItem");
if (lineItemSchema) {
  const fields = extractFieldsFromSchema(lineItemSchema);
  console.log(`\n'lineItem' has ${fields.length} fields (top-level + nested):`);
  fields.slice(0, 10).forEach((field) => {
    const optional = field.optional ? "?" : " ";
    const desc = field.description ? ` // ${field.description.substring(0, 50)}` : "";
    console.log(`  ${field.name}${optional}: ${field.type}${desc}`);
  });
  console.log(`  ... and ${fields.length - 10} more fields`);

  // Show required fields
  const required = extractRequiredFields(lineItemSchema);
  console.log(`\nRequired fields for creating a line item (${required.length}):`);
  required.forEach((field) => console.log(`  - ${field}`));
}

// 5. Show common update masks
console.log("\n🎨 5. Common Update Masks:");
console.log("-".repeat(60));
const updateMasks = getCommonUpdateMasks("lineItem");
console.log(`\nCommon update operations for 'lineItem':`);
updateMasks.forEach((mask) => {
  console.log(`  - ${mask}`);
});

// 6. Discover unconfigured entities
console.log("\n🔍 6. Discover New Entities:");
console.log("-".repeat(60));
const newEntities = discoverNewEntities();
if (newEntities.length > 0) {
  console.log(`\nFound ${newEntities.length} entities with schemas but no API config:`);
  newEntities.forEach((entity) => {
    const suggestion = suggestApiMetadata(entity);
    console.log(`\n  ${entity}:`);
    console.log(`    apiPathTemplate: "${suggestion.apiPathTemplate}"`);
    console.log(
      `    parentResourceIds: [${suggestion.parentResourceIds.map((id) => `"${id}"`).join(", ")}]`
    );
  });
} else {
  console.log("\n✅ All entities with schemas are configured!");
}

// 7. Compare dynamic vs hardcoded required fields
console.log("\n📊 7. Dynamic vs Manual Configuration:");
console.log("-".repeat(60));
const dynamicRequired = getRequiredFieldsFromSchema("lineItem");
console.log(`\nDynamic extraction from schema: ${dynamicRequired.length} fields`);
console.log(`  ${dynamicRequired.join(", ")}`);

console.log("\n✅ Demo complete!");
console.log("\n💡 Key Benefits:");
console.log("  1. Auto-discovery: New entities detected when schemas regenerate");
console.log("  2. Always in sync: Required fields extracted from schema");
console.log("  3. Minimal config: Just API path + parent IDs per entity");
console.log("  4. Rich metadata: Field types, descriptions, enums available");
console.log("\n=".repeat(60));

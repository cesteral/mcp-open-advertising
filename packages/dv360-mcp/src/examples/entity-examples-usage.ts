/**
 * Example usage of the entityExamples utility
 *
 * This demonstrates how to use curated entity examples in your code
 * to guide users or validate updates against known patterns.
 */

import {
  getEntityExamples,
  getEntityExamplesByCategory,
  getEntityExampleByOperation,
  formatEntityExamplesAsText,
  getExamplesSummary,
  findMatchingExample,
  getEntityTypesWithExamples,
  getExamplesByCategory,
} from "../mcp-server/tools/utils/entityExamples.js";

// Example 1: Get all examples for a specific entity type
console.log("=== Example 1: Get all line item examples ===\n");
const lineItemExamples = getEntityExamples("lineItem");
console.log(`Found ${lineItemExamples.length} examples for line items`);
lineItemExamples.forEach((ex, idx) => {
  console.log(`${idx + 1}. ${ex.operation} (${ex.category})`);
});

// Example 2: Get examples by category
console.log("\n=== Example 2: Get bid-related examples ===\n");
const bidExamples = getEntityExamplesByCategory("lineItem", "bid");
console.log(`Found ${bidExamples.length} bid examples:`);
bidExamples.forEach((ex) => {
  console.log(`- ${ex.operation}`);
  console.log(`  UpdateMask: ${ex.updateMask}`);
  console.log(`  Notes: ${ex.notes}\n`);
});

// Example 3: Get a specific example by operation name
console.log("\n=== Example 3: Get specific example ===\n");
const cpmExample = getEntityExampleByOperation("lineItem", "Update CPM bid");
if (cpmExample) {
  console.log(`Operation: ${cpmExample.operation}`);
  console.log(`Description: ${cpmExample.description}`);
  console.log(`Data:`, JSON.stringify(cpmExample.data, null, 2));
  console.log(`UpdateMask: ${cpmExample.updateMask}`);
  console.log(`Notes: ${cpmExample.notes}`);
}

// Example 4: Format examples as human-readable text
console.log("\n=== Example 4: Format all campaign examples as text ===\n");
const campaignExamplesText = formatEntityExamplesAsText("campaign");
console.log(campaignExamplesText);

// Example 5: Get a summary of available examples
console.log("\n=== Example 5: Get summary ===\n");
const summary = getExamplesSummary("insertionOrder");
console.log(summary);

// Example 6: Find matching example for a given update
console.log("\n=== Example 6: Find matching example ===\n");
const updateData = {
  entityStatus: "ENTITY_STATUS_PAUSED",
};
const updateMask = "entityStatus";
const matchingExample = findMatchingExample("lineItem", updateData, updateMask);
if (matchingExample) {
  console.log(`✓ Found matching example: ${matchingExample.operation}`);
  console.log(`  Notes: ${matchingExample.notes}`);
} else {
  console.log("✗ No matching example found");
}

// Example 7: Get all entity types with examples
console.log("\n=== Example 7: Entity types with examples ===\n");
const entityTypes = getEntityTypesWithExamples();
console.log(`Entity types with curated examples: ${entityTypes.join(", ")}`);

// Example 8: Get examples grouped by category
console.log("\n=== Example 8: Examples grouped by category ===\n");
const groupedExamples = getExamplesByCategory("lineItem");
Object.entries(groupedExamples).forEach(([category, examples]) => {
  console.log(`${category.toUpperCase()} (${examples.length} examples):`);
  examples.forEach((ex) => console.log(`  - ${ex.operation}`));
  console.log();
});

// Example 9: Use examples to enhance error messages
console.log("\n=== Example 9: Enhanced error messages ===\n");
const invalidUpdateMask = "invalidField";
const validExample = getEntityExampleByOperation("lineItem", "Update CPM bid");

console.log(`Error: Invalid updateMask '${invalidUpdateMask}' for lineItem`);
if (validExample) {
  console.log(`\nDid you mean? Try one of these common patterns:`);
  const commonExamples = getEntityExamplesByCategory("lineItem", "bid");
  commonExamples.slice(0, 3).forEach((ex) => {
    console.log(`  - ${ex.updateMask} (${ex.operation})`);
  });
}

// Example 10: Use examples in tool descriptions or help text
console.log("\n=== Example 10: Generate help text ===\n");
function generateToolHelpText(entityType: string): string {
  const examples = getEntityExamples(entityType);
  if (examples.length === 0) {
    return `No examples available for ${entityType}`;
  }

  let helpText = `## Common ${entityType} operations:\n\n`;

  // Group by category
  const grouped = getExamplesByCategory(entityType);
  Object.entries(grouped).forEach(([category, categoryExamples]) => {
    helpText += `### ${category.charAt(0).toUpperCase() + category.slice(1)} Operations\n\n`;
    categoryExamples.forEach((ex) => {
      helpText += `**${ex.operation}**\n`;
      helpText += `- UpdateMask: \`${ex.updateMask}\`\n`;
      helpText += `- ${ex.description}\n`;
      helpText += `- Note: ${ex.notes}\n\n`;
    });
  });

  return helpText;
}

const lineItemHelp = generateToolHelpText("lineItem");
console.log(lineItemHelp);

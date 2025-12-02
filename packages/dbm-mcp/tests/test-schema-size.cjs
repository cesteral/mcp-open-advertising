/**
 * Schema Size Validation Test
 *
 * Ensures all tool schemas stay under the stdio safe limit (100KB)
 * to prevent EPIPE errors when using MCP over stdio transport.
 *
 * Run with: node tests/test-schema-size.cjs
 */

const MAX_TOTAL_SIZE_BYTES = 100 * 1024; // 100KB safe limit for stdio
const MAX_SINGLE_TOOL_SIZE_BYTES = 50 * 1024; // 50KB per tool warning threshold

async function runTest() {
  console.log("Schema Size Validation Test\n");
  console.log("=".repeat(50));

  // Import reflect-metadata for tsyringe (required by tool imports)
  await import("reflect-metadata");

  // Dynamic import for ESM compatibility
  const { zodToJsonSchema } = await import("zod-to-json-schema");

  // Import all tool definitions
  // Note: This uses dynamic import since the source is ESM
  const tools = await import("../dist/mcp-server/tools/index.js");

  const allTools = tools.allTools;

  let totalSize = 0;
  const toolSizes = [];

  console.log("\nTool Schema Sizes:\n");

  for (const tool of allTools) {
    const jsonSchema = zodToJsonSchema(tool.inputSchema, {
      target: "jsonSchema7",
      markdownDescription: true,
    });

    const schemaJson = JSON.stringify(jsonSchema);
    const sizeBytes = Buffer.byteLength(schemaJson, "utf-8");
    totalSize += sizeBytes;

    const sizeKB = (sizeBytes / 1024).toFixed(2);
    const warning = sizeBytes > MAX_SINGLE_TOOL_SIZE_BYTES ? " ⚠️ LARGE" : "";

    console.log(`  ${tool.name}: ${sizeKB} KB${warning}`);

    toolSizes.push({
      name: tool.name,
      sizeBytes,
      sizeKB: parseFloat(sizeKB),
    });
  }

  console.log("\n" + "=".repeat(50));
  console.log(`\nTotal: ${(totalSize / 1024).toFixed(2)} KB`);
  console.log(`Limit: ${(MAX_TOTAL_SIZE_BYTES / 1024).toFixed(0)} KB`);

  const percentUsed = ((totalSize / MAX_TOTAL_SIZE_BYTES) * 100).toFixed(1);
  console.log(`Usage: ${percentUsed}%\n`);

  // Check if under limit
  if (totalSize > MAX_TOTAL_SIZE_BYTES) {
    console.error("❌ FAIL: Total schema size exceeds stdio safe limit!");
    console.error(`   ${(totalSize / 1024).toFixed(2)} KB > ${(MAX_TOTAL_SIZE_BYTES / 1024).toFixed(0)} KB`);
    console.error("\n   Consider:");
    console.error("   - Using simplified schemas for MCP tools");
    console.error("   - Moving detailed schemas to MCP Resources");
    console.error("   - Breaking large tools into smaller ones");
    process.exit(1);
  }

  console.log("✅ PASS: All schemas are within stdio safe limits\n");

  // Summary table
  console.log("Summary:");
  console.log("-".repeat(40));
  console.log(`Total tools:     ${allTools.length}`);
  console.log(`Total size:      ${(totalSize / 1024).toFixed(2)} KB`);
  console.log(`Average size:    ${(totalSize / allTools.length / 1024).toFixed(2)} KB per tool`);
  console.log(`Largest tool:    ${toolSizes.sort((a, b) => b.sizeBytes - a.sizeBytes)[0]?.name || "N/A"}`);
  console.log(`Remaining room:  ${((MAX_TOTAL_SIZE_BYTES - totalSize) / 1024).toFixed(2)} KB`);
  console.log("-".repeat(40));

  process.exit(0);
}

runTest().catch((error) => {
  console.error("Error running schema size test:", error);
  process.exit(1);
});

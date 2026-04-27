#!/usr/bin/env node
/**
 * Schema Generation Pipeline
 *
 * Main orchestration script that:
 * 1. Fetches Discovery Document
 * 2. Extracts minimal schemas
 * 3. Converts to OpenAPI 3.0
 * 4. Generates TypeScript types
 * 5. Generates Zod schemas
 * 6. Saves extraction report
 */

import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { dump as yamlDump } from "js-yaml";

// Import configuration
import { VALIDATED_CONFIG } from "../config/schema-extraction.config.js";

// Import pipeline stages
import { fetchDiscoveryDoc } from "./lib/fetch-discovery.js";
import { SchemaExtractor } from "./lib/schema-extractor.js";
import { convertToOpenAPI } from "./lib/convert-to-openapi.js";
import { generateZodSchemas as generateZodSchemasFromSpec } from "./lib/generate-zod-schemas.js";
import { ExtractionError } from "./lib/types.js";

// Get __dirname equivalent in ESM
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(__dirname, "..");

/**
 * Main pipeline execution
 */
async function main() {
  const startTime = Date.now();

  console.log("🚀 Starting schema generation pipeline...\n");
  console.log(`📋 Configuration:`);
  console.log(`   API Version: ${VALIDATED_CONFIG.apiVersion}`);
  console.log(`   Root Schemas: ${VALIDATED_CONFIG.rootSchemas.length}`);
  console.log(`   Output Path: ${VALIDATED_CONFIG.output.specPath}`);
  console.log("");

  try {
    // Step 1: Fetch Discovery Document
    console.log("📥 Step 1/7: Fetching Discovery Document...");
    const discoveryDoc = await fetchDiscoveryDoc(VALIDATED_CONFIG);
    const availableSchemas = Object.keys(discoveryDoc.schemas).length;
    console.log(`   ✓ Fetched ${availableSchemas} schemas\n`);

    // Step 2: Extract minimal schemas
    console.log("🔍 Step 2/7: Extracting schemas...");
    const extractor = new SchemaExtractor(discoveryDoc, VALIDATED_CONFIG);
    const { schemas, report } = await extractor.extract();
    console.log("");

    // Step 3: Convert to OpenAPI 3.0
    console.log("🔄 Step 3/7: Converting to OpenAPI 3.0...");
    const openApiSpec = await convertToOpenAPI(schemas, discoveryDoc, report, VALIDATED_CONFIG);
    console.log("");

    // Step 4: Save OpenAPI spec as YAML
    console.log("💾 Step 4/7: Saving OpenAPI specification...");
    const specPath = path.resolve(PACKAGE_ROOT, VALIDATED_CONFIG.output.specPath);
    await ensureDirectory(path.dirname(specPath));

    const yamlContent = yamlDump(openApiSpec, {
      indent: 2,
      lineWidth: 120,
      noRefs: true,
    });

    await fs.writeFile(specPath, yamlContent, "utf-8");
    const specSizeKB = Math.round(yamlContent.length / 1024);
    console.log(`   ✓ Saved to ${VALIDATED_CONFIG.output.specPath} (${specSizeKB} KB)\n`);

    // Step 5: Generate TypeScript types
    console.log("📝 Step 5/7: Generating TypeScript types...");
    await generateTypeScriptTypes(specPath);
    console.log("");

    // Step 6: Generate Zod schemas
    console.log("✨ Step 6/7: Generating Zod schemas...");
    await generateZodSchemas(openApiSpec);
    console.log("");

    // Step 7: Save extraction report
    console.log("📊 Step 7/7: Saving extraction report...");
    if (VALIDATED_CONFIG.output.generateReport) {
      const reportPath = path.resolve(PACKAGE_ROOT, VALIDATED_CONFIG.output.reportPath);
      await ensureDirectory(path.dirname(reportPath));

      const reportContent = VALIDATED_CONFIG.output.prettyPrint
        ? JSON.stringify(report, null, 2)
        : JSON.stringify(report);

      await fs.writeFile(reportPath, reportContent, "utf-8");
      console.log(`   ✓ Saved to ${VALIDATED_CONFIG.output.reportPath}\n`);
    } else {
      console.log(`   ⊘ Skipped (generateReport: false)\n`);
    }

    // Summary statistics
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log("✅ Pipeline completed successfully!\n");
    console.log("📊 Summary:");
    console.log(`   Total time: ${totalTime}s`);
    console.log(`   Schemas extracted: ${report.results.totalSchemas}`);
    console.log(`   - Root: ${report.results.rootSchemas.length}`);
    console.log(`   - Dependencies: ${report.results.resolvedDependencies.length}`);
    console.log(`   - Common types: ${report.results.commonTypesAdded.length}`);
    console.log(`   Size reduction: ${(report.sizeAnalysis.compressionRatio * 100).toFixed(1)}%`);
    console.log(
      `   - Original: ${Math.round(report.sizeAnalysis.originalDiscoverySize / 1024)} KB`
    );
    console.log(`   - Extracted: ${Math.round(report.sizeAnalysis.extractedSpecSize / 1024)} KB`);

    if (report.results.warnings.length > 0) {
      console.log(`\n⚠️  Warnings: ${report.results.warnings.length}`);
      for (const warning of report.results.warnings.slice(0, 5)) {
        console.log(`   - ${warning.message}`);
      }
      if (report.results.warnings.length > 5) {
        console.log(`   ... and ${report.results.warnings.length - 5} more`);
      }
    }

    if (report.results.circularReferences.length > 0) {
      console.log(`\n⚠️  Circular references: ${report.results.circularReferences.length}`);
      for (const ref of report.results.circularReferences.slice(0, 3)) {
        console.log(`   - ${ref.path.join(" -> ")}`);
      }
      if (report.results.circularReferences.length > 3) {
        console.log(`   ... and ${report.results.circularReferences.length - 3} more`);
      }
    }

    console.log("");
    process.exit(0);
  } catch (error: any) {
    console.error("\n❌ Pipeline failed!\n");

    if (error instanceof ExtractionError) {
      console.error(`Error [${error.code}]: ${error.message}`);
      if (error.details) {
        console.error("Details:", JSON.stringify(error.details, null, 2));
      }
    } else {
      console.error("Error:", error.message);
      if (error.stack) {
        console.error("\nStack trace:");
        console.error(error.stack);
      }
    }

    console.error("");
    process.exit(1);
  }
}

/**
 * Generate TypeScript types using openapi-typescript
 */
async function generateTypeScriptTypes(specPath: string): Promise<void> {
  const outputPath = path.resolve(PACKAGE_ROOT, VALIDATED_CONFIG.output.generatedPath, "types.ts");

  await ensureDirectory(path.dirname(outputPath));

  try {
    execSync(`npx openapi-typescript "${specPath}" -o "${outputPath}"`, {
      cwd: PACKAGE_ROOT,
      stdio: "inherit",
    });
    console.log(`   ✓ Generated ${VALIDATED_CONFIG.output.generatedPath}/types.ts`);
  } catch (error: any) {
    throw new Error(`Failed to generate TypeScript types: ${error.message}`);
  }
}

/**
 * Generate Zod schemas using custom generator
 */
async function generateZodSchemas(openApiSpec: any): Promise<void> {
  const outputPath = path.resolve(PACKAGE_ROOT, VALIDATED_CONFIG.output.generatedPath, "zod.ts");

  await ensureDirectory(path.dirname(outputPath));

  try {
    // Generate Zod schemas from OpenAPI spec
    const zodCode = generateZodSchemasFromSpec(openApiSpec);

    // Write to file
    await fs.writeFile(outputPath, zodCode, "utf-8");

    console.log(`   ✓ Generated ${VALIDATED_CONFIG.output.generatedPath}/zod.ts`);
  } catch (error: any) {
    throw new Error(`Failed to generate Zod schemas: ${error.message}`);
  }
}

/**
 * Ensure directory exists
 */
async function ensureDirectory(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error: any) {
    if (error.code !== "EEXIST") {
      throw error;
    }
  }
}

// Run the pipeline
main();

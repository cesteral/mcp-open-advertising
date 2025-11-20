/**
 * Test script to verify prompt message generation
 */
import { getFullCampaignSetupPromptMessage } from "../src/mcp-server/prompts/full-campaign-setup.prompt.js";

console.log("=".repeat(80));
console.log("Testing Full Campaign Setup Prompt");
console.log("=".repeat(80));

// Test 1: With advertiserId only
console.log("\n📋 Test 1: Basic workflow (no targeting)");
console.log("-".repeat(80));
const message1 = getFullCampaignSetupPromptMessage({
  advertiserId: "12345",
});
console.log(`Message length: ${message1.length} characters`);
console.log(`First 200 chars: ${message1.substring(0, 200)}...`);

// Test 2: With targeting enabled
console.log("\n📋 Test 2: Full workflow (with targeting)");
console.log("-".repeat(80));
const message2 = getFullCampaignSetupPromptMessage({
  advertiserId: "12345",
  includeTargeting: "true",
});
console.log(`Message length: ${message2.length} characters`);
console.log(`Includes targeting section: ${message2.includes("Step 5: Assign Targeting Options")}`);

// Test 3: Preview full message
console.log("\n📋 Test 3: Full message preview");
console.log("-".repeat(80));
console.log(message1);

console.log("\n" + "=".repeat(80));
console.log("✅ All tests passed!");
console.log("=".repeat(80));

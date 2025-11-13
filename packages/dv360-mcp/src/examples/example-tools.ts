import { zodToJsonSchema } from "zod-to-json-schema";
import type { Tool as McpTool } from "@modelcontextprotocol/sdk/types.js";
import { toolHandlers } from "./toolHandlers.js";

// Map of tool names to their entity and method types
const TOOL_ENTITY_MAP: Record<string, { entity: string; method: string }> = {
  getAdvertisers: { entity: "advertiser", method: "list" },
  getCampaigns: { entity: "campaign", method: "list" },
  getInsertionOrders: { entity: "insertionOrder", method: "list" },
  getLineItems: { entity: "lineItem", method: "list" },
  createCampaign: { entity: "campaign", method: "create" },
  createInsertionOrder: { entity: "insertionOrder", method: "create" },
  createLineItem: { entity: "lineItem", method: "create" },
  getTargetingOptions: { entity: "targetingOption", method: "list" },
  assignTargeting: { entity: "targeting", method: "assign" },
  // Add other tools as needed
};

// Get required fields for a tool based on entity and method
function getRequiredFieldsForTool(toolName: string): string[] {
  const mapping = TOOL_ENTITY_MAP[toolName];
  if (!mapping) return [];

  const { entity, method } = mapping;

  // Required fields based on our schema definitions
  if (method === "list") {
    if (entity === "advertiser") return ["partnerId"];
    if (entity === "campaign") return ["advertiserId"];
    if (entity === "insertionOrder") return ["advertiserId", "campaignId"];
    if (entity === "lineItem") return ["advertiserId", "insertionOrderId"];
    if (entity === "targetingOption") return ["advertiserId", "targetingType"];
    return ["advertiserId"]; // default fallback
  } else if (method === "get") {
    if (entity === "campaign") return ["advertiserId", "campaignId"];
    if (entity === "insertionOrder") return ["advertiserId", "insertionOrderId"];
    if (entity === "lineItem") return ["advertiserId", "lineItemId"];
    if (entity === "advertiser") return ["advertiserId"];
  } else if (method === "create") {
    if (entity === "campaign")
      return [
        "advertiserId",
        "displayName",
        "entityStatus",
        "campaignGoal",
        "campaignFlight",
        "frequencyCap",
      ];
    if (entity === "insertionOrder")
      return [
        "advertiserId",
        "campaignId",
        "displayName",
        "entityStatus",
        "pacing",
        "frequencyCap",
        "kpi",
        "budget",
        "optimizationObjective",
      ];
    if (entity === "lineItem")
      return [
        "advertiserId",
        "insertionOrderId",
        "displayName",
        "lineItemType",
        "entityStatus",
        "flight",
        "budget",
        "pacing",
        "frequencyCap",
        "partnerRevenueModel",
        "bidStrategy",
      ];
    if (entity === "advertiser") return ["partnerId", "displayName"];
  } else if (method === "patch") {
    if (entity === "campaign") return ["advertiserId", "campaignId", "updateMask"];
    if (entity === "insertionOrder") return ["advertiserId", "insertionOrderId", "updateMask"];
    if (entity === "lineItem") return ["advertiserId", "lineItemId", "updateMask"];
  } else if (method === "delete") {
    if (entity === "campaign") return ["advertiserId", "campaignId"];
    if (entity === "insertionOrder") return ["advertiserId", "insertionOrderId"];
    if (entity === "lineItem") return ["advertiserId", "lineItemId"];
  } else if (method === "assign") {
    if (entity === "targeting") return ["advertiserId", "lineItemId", "targetingType", "details"];
  }

  // For fullCampaignSetup (custom orchestration tool)
  if (toolName === "fullCampaignSetup") {
    return ["advertiserId", "campaign", "insertionOrder", "lineItem"];
  }

  return [];
}

/**
 * Create MCP Tool definitions from tool handlers
 */
export function createToolDefinitions(): McpTool[] {
  return Object.entries(toolHandlers).map(([name, handler]) => {
    // Convert Zod schema to JSON Schema with required fields properly marked
    const jsonSchema = zodToJsonSchema(handler.schema, {
      target: "jsonSchema7",
      markdownDescription: true,
      errorMessages: true,
    }) as any;

    // Get the required fields for this tool
    const requiredFields = getRequiredFieldsForTool(name);

    // Ensure the required fields are marked in the JSON Schema
    if (jsonSchema.properties && requiredFields.length > 0) {
      if (!jsonSchema.required) {
        jsonSchema.required = [];
      }

      // First, ensure all required fields have property definitions
      // This is critical for the inspector UI to display them
      for (const field of requiredFields) {
        // If the field doesn't exist in properties, add it with a basic definition
        if (!jsonSchema.properties[field]) {
          // Create a placeholder property definition
          jsonSchema.properties[field] = {
            type: "string",
            description: `${field} (required)`,
          };

          // Special handling for numeric IDs
          if (field.endsWith("Id")) {
            jsonSchema.properties[field] = {
              type: "string",
              description: `${field} - Numeric ID (required)`,
              pattern: "^\\d+$",
            };
          }
        }

        // Now add to required array if not already there
        if (!jsonSchema.required.includes(field)) {
          jsonSchema.required.push(field);

          // Update the property description to indicate it's required
          if (jsonSchema.properties[field]) {
            if (!jsonSchema.properties[field].description?.includes("(required)")) {
              jsonSchema.properties[field].description =
                (jsonSchema.properties[field].description || `${field}`) + " (required)";
            }
          }
        }
      }
    }

    return {
      name,
      description: handler.description || `Executes the ${name} tool`,
      inputSchema: jsonSchema,
      annotations: {
        title: name.charAt(0).toUpperCase() + name.slice(1).replace(/([A-Z])/g, " $1"),
        readOnlyHint: true,
        openWorldHint: true,
      },
    };
  });
}

/**
 * List of all available tools - FR-3 compliance
 */
export const tools: McpTool[] = createToolDefinitions();

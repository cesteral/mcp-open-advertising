import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";
import { ensureRequiredFieldValue } from "../utils/elicitation.js";

const TOOL_NAME = "dv360_create_custom_bidding_algorithm";
const TOOL_TITLE = "Create Custom Bidding Algorithm";

const TOOL_DESCRIPTION = `Create a new custom bidding algorithm in DV360 (Tier 2 workflow tool).

**Algorithm Types:**
- SCRIPT_BASED: Custom JavaScript-like bidding logic (most common)
- RULE_BASED: Declarative rules (restricted to allowlisted customers)

**Ownership:**
- Advertiser-owned: Algorithm is scoped to a single advertiser
- Partner-owned: Algorithm can be shared with multiple advertisers via sharedAdvertiserIds

**Important Notes:**
- Algorithm type is IMMUTABLE after creation
- Ownership (advertiserId/partnerId) is IMMUTABLE after creation
- Optionally upload initial script/rules during creation

**Example Use Cases:**
- Create a SCRIPT_BASED algorithm for custom CPM optimization
- Create a partner-level algorithm to share across advertisers`;

/**
 * Input schema for create custom bidding algorithm tool
 */
export const CreateCustomBiddingAlgorithmInputSchema = z
  .object({
    displayName: z
      .string()
      .optional()
      .describe("Algorithm display name (max 240 bytes UTF-8). Will be prompted if not provided."),
    algorithmType: z
      .enum(["SCRIPT_BASED", "RULE_BASED"])
      .describe("Type of algorithm. SCRIPT_BASED is most common. RULE_BASED requires allowlisting."),
    ownerType: z
      .enum(["advertiser", "partner"])
      .optional()
      .describe("Whether algorithm is owned by an advertiser or partner. Will be prompted if not provided."),
    ownerId: z
      .string()
      .optional()
      .describe("The advertiserId or partnerId depending on ownerType. Will be prompted if not provided."),
    sharedAdvertiserIds: z
      .array(z.string())
      .optional()
      .describe("For partner-owned algorithms: advertiser IDs to share access with"),
    initialScript: z
      .string()
      .optional()
      .describe("For SCRIPT_BASED: optional script content to upload immediately after creation"),
    initialRules: z
      .string()
      .optional()
      .describe("For RULE_BASED: optional rules content to upload immediately after creation"),
  })
  .describe("Parameters for creating a custom bidding algorithm");

/**
 * Output schema for create custom bidding algorithm tool
 */
export const CreateCustomBiddingAlgorithmOutputSchema = z
  .object({
    algorithm: z
      .object({
        customBiddingAlgorithmId: z.string(),
        displayName: z.string(),
        customBiddingAlgorithmType: z.string(),
        entityStatus: z.string(),
        advertiserId: z.string().optional(),
        partnerId: z.string().optional(),
        sharedAdvertiserIds: z.array(z.string()).optional(),
      })
      .describe("Created algorithm details"),
    scriptUpload: z
      .object({
        success: z.boolean(),
        scriptId: z.string().optional(),
        state: z.string().optional(),
        error: z.string().optional(),
      })
      .optional()
      .describe("Script upload result if initialScript was provided"),
    rulesUpload: z
      .object({
        success: z.boolean(),
        rulesId: z.string().optional(),
        state: z.string().optional(),
        error: z.string().optional(),
      })
      .optional()
      .describe("Rules upload result if initialRules was provided"),
    timestamp: z.string().datetime(),
  })
  .describe("Create custom bidding algorithm result");

type CreateCustomBiddingAlgorithmInput = z.infer<typeof CreateCustomBiddingAlgorithmInputSchema>;
type CreateCustomBiddingAlgorithmOutput = z.infer<typeof CreateCustomBiddingAlgorithmOutputSchema>;

/**
 * Create custom bidding algorithm tool logic
 */
export async function createCustomBiddingAlgorithmLogic(
  input: CreateCustomBiddingAlgorithmInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<CreateCustomBiddingAlgorithmOutput> {
  const { dv360Service } = resolveSessionServices(sdkContext);

  // Elicit display name if not provided
  const displayName = await ensureRequiredFieldValue({
    fieldName: "displayName",
    fieldLabel: "Algorithm Display Name",
    entityType: "custom bidding algorithm",
    operation: "create",
    sdkContext,
    currentValue: input.displayName,
  });

  // Elicit owner type if not provided
  let ownerType = input.ownerType;
  if (!ownerType) {
    const elicitedOwnerType = await ensureRequiredFieldValue({
      fieldName: "ownerType",
      fieldLabel: "Owner Type (advertiser or partner)",
      entityType: "custom bidding algorithm",
      operation: "create",
      sdkContext,
      currentValue: undefined,
    });
    ownerType = elicitedOwnerType as "advertiser" | "partner";
  }

  // Elicit owner ID if not provided
  const ownerIdLabel = ownerType === "advertiser" ? "Advertiser ID" : "Partner ID";
  const ownerId = await ensureRequiredFieldValue({
    fieldName: ownerType === "advertiser" ? "advertiserId" : "partnerId",
    fieldLabel: ownerIdLabel,
    entityType: "custom bidding algorithm",
    operation: "create",
    sdkContext,
    currentValue: input.ownerId,
  });

  // Build algorithm data
  const algorithmData: Record<string, unknown> = {
    displayName,
    customBiddingAlgorithmType: input.algorithmType,
    entityStatus: "ENTITY_STATUS_ACTIVE",
  };

  // Set owner
  if (ownerType === "advertiser") {
    algorithmData.advertiserId = ownerId;
  } else {
    algorithmData.partnerId = ownerId;
    if (input.sharedAdvertiserIds && input.sharedAdvertiserIds.length > 0) {
      algorithmData.sharedAdvertiserIds = input.sharedAdvertiserIds;
    }
  }

  // Create the algorithm using generic entity service
  const createdAlgorithm = (await dv360Service.createEntity(
    "customBiddingAlgorithm",
    {}, // No path IDs needed for top-level entity
    algorithmData,
    context
  )) as Record<string, any>;

  const algorithmId = createdAlgorithm.customBiddingAlgorithmId;

  const result: CreateCustomBiddingAlgorithmOutput = {
    algorithm: {
      customBiddingAlgorithmId: algorithmId,
      displayName: createdAlgorithm.displayName,
      customBiddingAlgorithmType: createdAlgorithm.customBiddingAlgorithmType,
      entityStatus: createdAlgorithm.entityStatus,
      advertiserId: createdAlgorithm.advertiserId,
      partnerId: createdAlgorithm.partnerId,
      sharedAdvertiserIds: createdAlgorithm.sharedAdvertiserIds,
    },
    timestamp: new Date().toISOString(),
  };

  // Upload initial script if provided (for SCRIPT_BASED algorithms)
  if (input.initialScript && input.algorithmType === "SCRIPT_BASED") {
    try {
      // Step 1: Upload script file
      const uploadResult = await dv360Service.uploadCustomBiddingScript(
        algorithmId,
        input.initialScript,
        context
      );

      // Step 2: Create script resource
      const script = await dv360Service.createCustomBiddingScript(
        algorithmId,
        uploadResult.resourceName,
        context
      );

      result.scriptUpload = {
        success: true,
        scriptId: script.customBiddingScriptId,
        state: script.state,
      };
    } catch (error: any) {
      result.scriptUpload = {
        success: false,
        error: error.message || String(error),
      };
    }
  }

  // Upload initial rules if provided (for RULE_BASED algorithms)
  if (input.initialRules && input.algorithmType === "RULE_BASED") {
    try {
      // Step 1: Upload rules file
      const uploadResult = await dv360Service.uploadCustomBiddingRules(
        algorithmId,
        input.initialRules,
        context
      );

      // Step 2: Create rules resource
      const rules = await dv360Service.createCustomBiddingRules(
        algorithmId,
        uploadResult.resourceName,
        context
      );

      result.rulesUpload = {
        success: true,
        rulesId: rules.customBiddingAlgorithmRulesId,
        state: rules.state,
      };
    } catch (error: any) {
      result.rulesUpload = {
        success: false,
        error: error.message || String(error),
      };
    }
  }

  return result;
}

/**
 * Format response for MCP client
 */
export function createCustomBiddingAlgorithmResponseFormatter(
  result: CreateCustomBiddingAlgorithmOutput
): McpTextContent[] {
  let message = `Custom bidding algorithm created successfully!\n\n`;
  message += `**Algorithm Details:**\n`;
  message += `- ID: ${result.algorithm.customBiddingAlgorithmId}\n`;
  message += `- Name: ${result.algorithm.displayName}\n`;
  message += `- Type: ${result.algorithm.customBiddingAlgorithmType}\n`;
  message += `- Status: ${result.algorithm.entityStatus}\n`;

  if (result.algorithm.advertiserId) {
    message += `- Owner: Advertiser ${result.algorithm.advertiserId}\n`;
  } else if (result.algorithm.partnerId) {
    message += `- Owner: Partner ${result.algorithm.partnerId}\n`;
    if (result.algorithm.sharedAdvertiserIds?.length) {
      message += `- Shared with: ${result.algorithm.sharedAdvertiserIds.join(", ")}\n`;
    }
  }

  if (result.scriptUpload) {
    message += `\n**Script Upload:**\n`;
    if (result.scriptUpload.success) {
      message += `- Script ID: ${result.scriptUpload.scriptId}\n`;
      message += `- State: ${result.scriptUpload.state}\n`;
      if (result.scriptUpload.state === "PENDING") {
        message += `- Note: Script is being processed. Check back later for ACCEPTED/REJECTED status.\n`;
      }
    } else {
      message += `- Failed: ${result.scriptUpload.error}\n`;
    }
  }

  if (result.rulesUpload) {
    message += `\n**Rules Upload:**\n`;
    if (result.rulesUpload.success) {
      message += `- Rules ID: ${result.rulesUpload.rulesId}\n`;
      message += `- State: ${result.rulesUpload.state}\n`;
    } else {
      message += `- Failed: ${result.rulesUpload.error}\n`;
    }
  }

  message += `\nTimestamp: ${result.timestamp}`;

  return [
    {
      type: "text" as const,
      text: message,
    },
  ];
}

/**
 * Create Custom Bidding Algorithm Tool Definition
 */
export const createCustomBiddingAlgorithmTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: CreateCustomBiddingAlgorithmInputSchema,
  outputSchema: CreateCustomBiddingAlgorithmOutputSchema,
  inputExamples: [
    {
      label: "Create a script-based algorithm for an advertiser",
      input: {
        displayName: "Custom CPM Optimizer Q1 2025",
        algorithmType: "SCRIPT_BASED",
        ownerType: "advertiser",
        ownerId: "1234567",
        initialScript: "// Custom bidding script\nfunction bid(request) {\n  return request.floorPrice * 1.2;\n}",
      },
    },
    {
      label: "Create a partner-owned script-based algorithm shared with advertisers",
      input: {
        displayName: "Partner-Level Bid Optimizer",
        algorithmType: "SCRIPT_BASED",
        ownerType: "partner",
        ownerId: "9876543",
        sharedAdvertiserIds: ["1234567", "2345678"],
      },
    },
  ],
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: false,
    idempotentHint: false,
  },
  logic: createCustomBiddingAlgorithmLogic,
  responseFormatter: createCustomBiddingAlgorithmResponseFormatter,
};

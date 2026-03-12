import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";
import { ensureRequiredFieldValue } from "../utils/elicitation.js";

const TOOL_NAME = "dv360_manage_custom_bidding_script";
const TOOL_TITLE = "Manage Custom Bidding Script";

const TOOL_DESCRIPTION = `Upload and manage scripts for SCRIPT_BASED custom bidding algorithms (Tier 2 workflow tool).

**Actions:**
- upload: Upload a new script version to the algorithm
- list: List all scripts for an algorithm
- get: Get details of a specific script
- getActive: Get the currently active script

**Script States:**
- PENDING: Script is being processed by backend
- ACCEPTED: Script is ready for scoring impressions
- REJECTED: Script has errors (check errors field for details)

**Important Notes:**
- Only one script can be active at a time per algorithm
- New uploads automatically become active after ACCEPTED
- Scripts cannot be deleted, only replaced with new versions`;

/**
 * Input schema for manage custom bidding script tool
 */
export const ManageCustomBiddingScriptInputSchema = z
  .object({
    customBiddingAlgorithmId: z
      .string()
      .optional()
      .describe("The algorithm ID. Will be prompted if not provided."),
    action: z
      .enum(["upload", "list", "get", "getActive"])
      .describe("Action to perform: upload, list, get, or getActive"),
    scriptContent: z
      .string()
      .optional()
      .describe("Script content (required for upload action)"),
    customBiddingScriptId: z
      .string()
      .optional()
      .describe("Script ID (required for get action)"),
  })
  .describe("Parameters for managing custom bidding scripts");

/**
 * Output schema for manage custom bidding script tool
 */
export const ManageCustomBiddingScriptOutputSchema = z
  .object({
    action: z.string(),
    customBiddingAlgorithmId: z.string(),
    script: z
      .object({
        customBiddingScriptId: z.string(),
        createTime: z.string(),
        active: z.boolean(),
        state: z.string(),
        errors: z
          .array(
            z.object({
              errorCode: z.string(),
              line: z.string().optional(),
              column: z.string().optional(),
              errorMessage: z.string(),
            })
          )
          .optional(),
      })
      .optional()
      .describe("Script details (for upload, get, getActive)"),
    scripts: z
      .array(
        z.object({
          customBiddingScriptId: z.string(),
          createTime: z.string(),
          active: z.boolean(),
          state: z.string(),
        })
      )
      .optional()
      .describe("List of scripts (for list action)"),
    nextPageToken: z.string().optional(),
    timestamp: z.string().datetime(),
  })
  .describe("Manage custom bidding script result");

type ManageCustomBiddingScriptInput = z.infer<typeof ManageCustomBiddingScriptInputSchema>;
type ManageCustomBiddingScriptOutput = z.infer<typeof ManageCustomBiddingScriptOutputSchema>;

/**
 * Manage custom bidding script tool logic
 */
export async function manageCustomBiddingScriptLogic(
  input: ManageCustomBiddingScriptInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<ManageCustomBiddingScriptOutput> {
  const { dv360Service } = resolveSessionServices(sdkContext);

  // Elicit algorithm ID if not provided
  const algorithmId = await ensureRequiredFieldValue({
    fieldName: "customBiddingAlgorithmId",
    fieldLabel: "Custom Bidding Algorithm ID",
    entityType: "custom bidding script",
    operation: input.action,
    sdkContext,
    currentValue: input.customBiddingAlgorithmId,
  });

  const result: ManageCustomBiddingScriptOutput = {
    action: input.action,
    customBiddingAlgorithmId: algorithmId,
    timestamp: new Date().toISOString(),
  };

  switch (input.action) {
    case "upload": {
      if (!input.scriptContent) {
        throw new Error("scriptContent is required for upload action");
      }

      // Step 1: Upload script file
      const uploadResult = await dv360Service.uploadCustomBiddingScript(
        algorithmId,
        input.scriptContent,
        context
      );

      // Step 2: Create script resource
      const script = await dv360Service.createCustomBiddingScript(
        algorithmId,
        uploadResult.resourceName,
        context
      );

      result.script = {
        customBiddingScriptId: script.customBiddingScriptId,
        createTime: script.createTime,
        active: script.active,
        state: script.state,
        errors: script.errors?.map((e) => ({
          errorCode: e.errorCode,
          line: e.line,
          column: e.column,
          errorMessage: e.errorMessage,
        })),
      };
      break;
    }

    case "list": {
      const { scripts } = await dv360Service.listCustomBiddingScripts(
        algorithmId,
        undefined,
        undefined,
        context
      );

      result.scripts = scripts.map((s) => ({
        customBiddingScriptId: s.customBiddingScriptId,
        createTime: s.createTime,
        active: s.active,
        state: s.state,
      }));
      break;
    }

    case "get": {
      const scriptId = await ensureRequiredFieldValue({
        fieldName: "customBiddingScriptId",
        fieldLabel: "Script ID",
        entityType: "custom bidding script",
        operation: "get",
        sdkContext,
        currentValue: input.customBiddingScriptId,
      });

      const script = await dv360Service.getCustomBiddingScript(algorithmId, scriptId, context);

      result.script = {
        customBiddingScriptId: script.customBiddingScriptId,
        createTime: script.createTime,
        active: script.active,
        state: script.state,
        errors: script.errors?.map((e) => ({
          errorCode: e.errorCode,
          line: e.line,
          column: e.column,
          errorMessage: e.errorMessage,
        })),
      };
      break;
    }

    case "getActive": {
      const { scripts } = await dv360Service.listCustomBiddingScripts(
        algorithmId,
        undefined,
        undefined,
        context
      );

      const activeScript = scripts.find((s) => s.active);

      if (activeScript) {
        result.script = {
          customBiddingScriptId: activeScript.customBiddingScriptId,
          createTime: activeScript.createTime,
          active: activeScript.active,
          state: activeScript.state,
          errors: activeScript.errors?.map((e) => ({
            errorCode: e.errorCode,
            line: e.line,
            column: e.column,
            errorMessage: e.errorMessage,
          })),
        };
      }
      break;
    }
  }

  return result;
}

/**
 * Format response for MCP client
 */
export function manageCustomBiddingScriptResponseFormatter(
  result: ManageCustomBiddingScriptOutput
): McpTextContent[] {
  let message = `**Action:** ${result.action}\n`;
  message += `**Algorithm ID:** ${result.customBiddingAlgorithmId}\n\n`;

  if (result.script) {
    message += `**Script Details:**\n`;
    message += `- Script ID: ${result.script.customBiddingScriptId}\n`;
    message += `- Created: ${result.script.createTime}\n`;
    message += `- Active: ${result.script.active ? "Yes" : "No"}\n`;
    message += `- State: ${result.script.state}\n`;

    if (result.script.state === "PENDING") {
      message += `\n> Script is being processed. Check back later for final status.\n`;
    } else if (result.script.state === "REJECTED" && result.script.errors?.length) {
      message += `\n**Errors:**\n`;
      for (const error of result.script.errors) {
        message += `- [${error.errorCode}] Line ${error.line || "?"}, Col ${error.column || "?"}: ${error.errorMessage}\n`;
      }
    }
  }

  if (result.scripts) {
    message += `**Scripts (${result.scripts.length}):**\n`;
    if (result.scripts.length === 0) {
      message += `No scripts found for this algorithm.\n`;
    } else {
      for (const script of result.scripts) {
        const activeMarker = script.active ? " [ACTIVE]" : "";
        message += `- ${script.customBiddingScriptId}${activeMarker}: ${script.state} (${script.createTime})\n`;
      }
    }
  }

  if (result.action === "getActive" && !result.script) {
    message += `No active script found for this algorithm.\n`;
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
 * Manage Custom Bidding Script Tool Definition
 */
export const manageCustomBiddingScriptTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: ManageCustomBiddingScriptInputSchema,
  outputSchema: ManageCustomBiddingScriptOutputSchema,
  inputExamples: [
    {
      label: "Upload a new script to an algorithm",
      input: {
        customBiddingAlgorithmId: "1122334455",
        action: "upload",
        scriptContent: "// Custom bidding script v2\nfunction bid(request) {\n  const baseBid = request.floorPrice;\n  const multiplier = request.userList ? 1.5 : 1.0;\n  return baseBid * multiplier;\n}",
      },
    },
    {
      label: "List all scripts for an algorithm",
      input: {
        customBiddingAlgorithmId: "1122334455",
        action: "list",
      },
    },
    {
      label: "Get a specific script by ID",
      input: {
        customBiddingAlgorithmId: "1122334455",
        action: "get",
        customBiddingScriptId: "9988776655",
      },
    },
  ],
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: false,
    idempotentHint: false,
  },
  logic: manageCustomBiddingScriptLogic,
  responseFormatter: manageCustomBiddingScriptResponseFormatter,
};

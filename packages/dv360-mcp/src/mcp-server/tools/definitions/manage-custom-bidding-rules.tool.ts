// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";
import { ensureRequiredFieldValue } from "../utils/elicitation.js";

const TOOL_NAME = "dv360_manage_custom_bidding_rules";
const TOOL_TITLE = "Manage Custom Bidding Rules";

const TOOL_DESCRIPTION = `Upload and manage rules for RULE_BASED custom bidding algorithms (Tier 2 workflow tool).

**Important:** RULE_BASED algorithms are restricted to allowlisted customers. If your account
is not allowlisted, you will receive an error when trying to use this feature.

**Actions:**
- upload: Upload a new rules version to the algorithm
- list: List all rules for an algorithm
- get: Get details of a specific rules resource
- getActive: Get the currently active rules

**Rules States:**
- ACCEPTED: Rules are ready for scoring impressions
- REJECTED: Rules have errors (check error field for details)

**Important Notes:**
- Only one rules set can be active at a time per algorithm
- New uploads automatically become active after ACCEPTED
- Rules cannot be deleted, only replaced with new versions`;

/**
 * Input schema for manage custom bidding rules tool
 */
export const ManageCustomBiddingRulesInputSchema = z
  .object({
    customBiddingAlgorithmId: z
      .string()
      .optional()
      .describe("The algorithm ID. Will be prompted if not provided."),
    action: z
      .enum(["upload", "list", "get", "getActive"])
      .describe("Action to perform: upload, list, get, or getActive"),
    rulesContent: z
      .string()
      .optional()
      .describe("Rules content in AlgorithmRules format (required for upload action)"),
    customBiddingAlgorithmRulesId: z
      .string()
      .optional()
      .describe("Rules ID (required for get action)"),
  })
  .describe("Parameters for managing custom bidding rules");

/**
 * Output schema for manage custom bidding rules tool
 */
export const ManageCustomBiddingRulesOutputSchema = z
  .object({
    action: z.string(),
    customBiddingAlgorithmId: z.string(),
    rules: z
      .object({
        customBiddingAlgorithmRulesId: z.string(),
        createTime: z.string(),
        active: z.boolean(),
        state: z.string(),
        error: z
          .object({
            errorCode: z.string(),
            errorMessage: z.string(),
          })
          .optional(),
      })
      .optional()
      .describe("Rules details (for upload, get, getActive)"),
    rulesList: z
      .array(
        z.object({
          customBiddingAlgorithmRulesId: z.string(),
          createTime: z.string(),
          active: z.boolean(),
          state: z.string(),
        })
      )
      .optional()
      .describe("List of rules (for list action)"),
    nextPageToken: z.string().optional(),
    timestamp: z.string().datetime(),
  })
  .describe("Manage custom bidding rules result");

type ManageCustomBiddingRulesInput = z.infer<typeof ManageCustomBiddingRulesInputSchema>;
type ManageCustomBiddingRulesOutput = z.infer<typeof ManageCustomBiddingRulesOutputSchema>;

/**
 * Manage custom bidding rules tool logic
 */
export async function manageCustomBiddingRulesLogic(
  input: ManageCustomBiddingRulesInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<ManageCustomBiddingRulesOutput> {
  const { dv360Service } = resolveSessionServices(sdkContext);

  // Elicit algorithm ID if not provided
  const algorithmId = await ensureRequiredFieldValue({
    fieldName: "customBiddingAlgorithmId",
    fieldLabel: "Custom Bidding Algorithm ID",
    entityType: "custom bidding rules",
    operation: input.action,
    sdkContext,
    currentValue: input.customBiddingAlgorithmId,
  });

  const result: ManageCustomBiddingRulesOutput = {
    action: input.action,
    customBiddingAlgorithmId: algorithmId,
    timestamp: new Date().toISOString(),
  };

  switch (input.action) {
    case "upload": {
      if (!input.rulesContent) {
        throw new Error("rulesContent is required for upload action");
      }

      // Step 1: Upload rules file
      const uploadResult = await dv360Service.uploadCustomBiddingRules(
        algorithmId,
        input.rulesContent,
        context
      );

      // Step 2: Create rules resource
      const rules = await dv360Service.createCustomBiddingRules(
        algorithmId,
        uploadResult.resourceName,
        context
      );

      result.rules = {
        customBiddingAlgorithmRulesId: rules.customBiddingAlgorithmRulesId,
        createTime: rules.createTime,
        active: rules.active,
        state: rules.state,
        error: rules.error
          ? {
              errorCode: rules.error.errorCode,
              errorMessage: rules.error.errorMessage,
            }
          : undefined,
      };
      break;
    }

    case "list": {
      const { rules } = await dv360Service.listCustomBiddingRules(
        algorithmId,
        undefined,
        undefined,
        context
      );

      result.rulesList = rules.map((r) => ({
        customBiddingAlgorithmRulesId: r.customBiddingAlgorithmRulesId,
        createTime: r.createTime,
        active: r.active,
        state: r.state,
      }));
      break;
    }

    case "get": {
      const rulesId = await ensureRequiredFieldValue({
        fieldName: "customBiddingAlgorithmRulesId",
        fieldLabel: "Rules ID",
        entityType: "custom bidding rules",
        operation: "get",
        sdkContext,
        currentValue: input.customBiddingAlgorithmRulesId,
      });

      const rules = await dv360Service.getCustomBiddingRules(algorithmId, rulesId, context);

      result.rules = {
        customBiddingAlgorithmRulesId: rules.customBiddingAlgorithmRulesId,
        createTime: rules.createTime,
        active: rules.active,
        state: rules.state,
        error: rules.error
          ? {
              errorCode: rules.error.errorCode,
              errorMessage: rules.error.errorMessage,
            }
          : undefined,
      };
      break;
    }

    case "getActive": {
      const { rules } = await dv360Service.listCustomBiddingRules(
        algorithmId,
        undefined,
        undefined,
        context
      );

      const activeRules = rules.find((r) => r.active);

      if (activeRules) {
        result.rules = {
          customBiddingAlgorithmRulesId: activeRules.customBiddingAlgorithmRulesId,
          createTime: activeRules.createTime,
          active: activeRules.active,
          state: activeRules.state,
          error: activeRules.error
            ? {
                errorCode: activeRules.error.errorCode,
                errorMessage: activeRules.error.errorMessage,
              }
            : undefined,
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
export function manageCustomBiddingRulesResponseFormatter(
  result: ManageCustomBiddingRulesOutput
): McpTextContent[] {
  let message = `**Action:** ${result.action}\n`;
  message += `**Algorithm ID:** ${result.customBiddingAlgorithmId}\n\n`;

  if (result.rules) {
    message += `**Rules Details:**\n`;
    message += `- Rules ID: ${result.rules.customBiddingAlgorithmRulesId}\n`;
    message += `- Created: ${result.rules.createTime}\n`;
    message += `- Active: ${result.rules.active ? "Yes" : "No"}\n`;
    message += `- State: ${result.rules.state}\n`;

    if (result.rules.state === "REJECTED" && result.rules.error) {
      message += `\n**Error:**\n`;
      message += `- [${result.rules.error.errorCode}]: ${result.rules.error.errorMessage}\n`;
    }
  }

  if (result.rulesList) {
    message += `**Rules (${result.rulesList.length}):**\n`;
    if (result.rulesList.length === 0) {
      message += `No rules found for this algorithm.\n`;
    } else {
      for (const rules of result.rulesList) {
        const activeMarker = rules.active ? " [ACTIVE]" : "";
        message += `- ${rules.customBiddingAlgorithmRulesId}${activeMarker}: ${rules.state} (${rules.createTime})\n`;
      }
    }
  }

  if (result.action === "getActive" && !result.rules) {
    message += `No active rules found for this algorithm.\n`;
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
 * Manage Custom Bidding Rules Tool Definition
 */
export const manageCustomBiddingRulesTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: ManageCustomBiddingRulesInputSchema,
  outputSchema: ManageCustomBiddingRulesOutputSchema,
  inputExamples: [
    {
      label: "Upload new rules to an algorithm",
      input: {
        customBiddingAlgorithmId: "1122334455",
        action: "upload",
        rulesContent: '{"rules": [{"condition": {"impressionCount": {"min": 1000}}, "bid": {"fixedBid": {"bidAmountMicros": "5000000"}}}]}',
      },
    },
    {
      label: "List all rules for an algorithm",
      input: {
        customBiddingAlgorithmId: "1122334455",
        action: "list",
      },
    },
    {
      label: "Get the currently active rules",
      input: {
        customBiddingAlgorithmId: "1122334455",
        action: "getActive",
      },
    },
  ],
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: false,
    idempotentHint: false,
  },
  logic: manageCustomBiddingRulesLogic,
  responseFormatter: manageCustomBiddingRulesResponseFormatter,
};
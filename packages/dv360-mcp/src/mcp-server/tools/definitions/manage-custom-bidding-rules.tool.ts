// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
  McpError,
  JsonRpcErrorCode,
  assertGovernedEffectDryRun,
  EffectResultSchema,
  EffectDryRunResultSchema,
  DispatchedCapabilitySchema,
} from "@cesteral/shared";
import type {
  RequestContext,
  McpTextContent,
  SdkContext,
  EffectDryRunResult,
  DispatchedCapability,
  CesteralWriteToolAnnotations,
} from "@cesteral/shared";
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
- Rules cannot be deleted, only replaced with new versions
- **Required scope:** pass \`advertiserId\` (algorithm is advertiser-owned) OR \`partnerId\` (algorithm is partner-owned). DV360 returns 403 'permission for partner 0' otherwise.
- **Upload protocol:** \`upload\` performs DV360's two-step media flow internally — it reserves an upload location (\`GET :uploadRules\`), streams the rules bytes to the media endpoint, then creates the rules resource (\`rules.create\`). Callers just pass \`rulesContent\`.`;

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
    advertiserId: z
      .string()
      .optional()
      .describe(
        "Advertiser scope (required if the algorithm is advertiser-owned). " +
          "DV360 returns 403 'permission for partner 0' when neither this nor partnerId is supplied."
      ),
    partnerId: z
      .string()
      .optional()
      .describe("Partner scope (required if the algorithm is partner-owned). See advertiserId."),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the request and returns an EffectDryRunResult under `dryRun` without eliciting missing fields or calling the DV360 API. Action-specific required fields surface as validation errors. Nothing is changed."
      ),
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
    dryRun: EffectDryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. Nothing was changed."
    ),
    effect: EffectResultSchema.optional().describe(
      "Effect-class result identity (effectKind `custom_bidding_rules_managed` + scalar audit summary incl. the action). Present on a confirmed execute."
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "The concrete (operation, entityKind) this call resolved to — `manage` with `canonicalEntityKind: null` (effect class). Present on every response."
    ),
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
  // Effect-class write: custom bidding rules are not a canonical entity.
  const dispatchedCapability: DispatchedCapability = {
    operation: "manage",
    canonicalEntityKind: null,
  };

  if (input.dry_run === true) {
    return {
      action: input.action,
      customBiddingAlgorithmId: input.customBiddingAlgorithmId ?? "",
      timestamp: new Date().toISOString(),
      dryRun: buildRulesEffectDryRun(input),
      dispatchedCapability,
    };
  }

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

  // DV360's rules sub-resources require the algorithm's owner scope as a
  // query param. Without it Google defaults to partner 0 and returns 403.
  if (!input.advertiserId && !input.partnerId) {
    throw new McpError(
      JsonRpcErrorCode.InvalidParams,
      "Either advertiserId or partnerId is required to scope rules operations to the algorithm's owner."
    );
  }
  const scope = { advertiserId: input.advertiserId, partnerId: input.partnerId };

  const result: ManageCustomBiddingRulesOutput = {
    action: input.action,
    customBiddingAlgorithmId: algorithmId,
    timestamp: new Date().toISOString(),
    effect: {
      effectKind: "custom_bidding_rules_managed",
      summary: { action: input.action, algorithm_id: algorithmId },
    },
    dispatchedCapability,
  };

  switch (input.action) {
    case "upload": {
      if (!input.rulesContent) {
        throw new McpError(
          JsonRpcErrorCode.InvalidParams,
          "rulesContent is required for upload action"
        );
      }

      // Step 1: Upload rules file
      const uploadResult = await dv360Service.uploadCustomBiddingRules(
        algorithmId,
        input.rulesContent,
        scope,
        context
      );

      // Step 2: Create rules resource
      const rules = await dv360Service.createCustomBiddingRules(
        algorithmId,
        uploadResult.resourceName,
        scope,
        context
      );

      result.rules = {
        customBiddingAlgorithmRulesId: rules.customBiddingAlgorithmRulesId,
        createTime: rules.createTime ?? "",
        active: rules.active ?? false,
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
        scope,
        context
      );

      result.rulesList = rules.map((r) => ({
        customBiddingAlgorithmRulesId: r.customBiddingAlgorithmRulesId,
        createTime: r.createTime ?? "",
        active: r.active ?? false,
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

      const rules = await dv360Service.getCustomBiddingRules(algorithmId, rulesId, scope, context);

      result.rules = {
        customBiddingAlgorithmRulesId: rules.customBiddingAlgorithmRulesId,
        createTime: rules.createTime ?? "",
        active: rules.active ?? false,
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
        scope,
        context
      );

      const activeRules = rules.find((r) => r.active);

      if (activeRules) {
        result.rules = {
          customBiddingAlgorithmRulesId: activeRules.customBiddingAlgorithmRulesId,
          createTime: activeRules.createTime ?? "",
          active: activeRules.active ?? false,
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
 * Symbolic effect dry-run for `dv360_manage_custom_bidding_rules`. A preview
 * cannot elicit interactively, so action-specific required fields (algorithm id
 * always; rulesContent for upload; rules id for get; owner scope) surface as
 * validation errors when absent. Pure (no I/O); never includes rulesContent.
 */
function buildRulesEffectDryRun(input: ManageCustomBiddingRulesInput): EffectDryRunResult {
  const errors = [] as { code: string; message: string; field?: string }[];
  if (!input.customBiddingAlgorithmId)
    errors.push({
      code: "MISSING_FIELD",
      message: "customBiddingAlgorithmId is required (would be prompted on a real call)",
      field: "customBiddingAlgorithmId",
    });
  if (!input.advertiserId && !input.partnerId)
    errors.push({
      code: "MISSING_SCOPE",
      message: "advertiserId or partnerId is required to scope the algorithm owner",
      field: "advertiserId",
    });
  if (input.action === "upload" && !input.rulesContent)
    errors.push({
      code: "MISSING_FIELD",
      message: "rulesContent is required for the upload action",
      field: "rulesContent",
    });
  if (input.action === "get" && !input.customBiddingAlgorithmRulesId)
    errors.push({
      code: "MISSING_FIELD",
      message: "customBiddingAlgorithmRulesId is required for the get action",
      field: "customBiddingAlgorithmRulesId",
    });

  return assertGovernedEffectDryRun(
    {
      wouldSucceed: errors.length === 0,
      validationErrors: errors,
      validationSource: "symbolic",
      expectedEffectSource: "symbolic",
      expectedEffect: {
        effectKind: "custom_bidding_rules_managed",
        summary: { action: input.action },
      },
    },
    TOOL_NAME,
    { requiresValidation: true, requiresSimulation: true }
  );
}

/**
 * Format response for MCP client
 */
export function manageCustomBiddingRulesResponseFormatter(
  result: ManageCustomBiddingRulesOutput
): McpTextContent[] {
  if (result.dryRun) {
    const { wouldSucceed, validationErrors, validationSource, expectedEffectSource } =
      result.dryRun;
    const errs = validationErrors.map((e) => `  - [${e.code}] ${e.message}`).join("\n");
    return [
      {
        type: "text" as const,
        text:
          `Dry run: custom bidding rules ${result.action} ${wouldSucceed ? "would succeed" : "would FAIL"} (validation: ${validationSource}, expected-effect: ${expectedEffectSource}). Nothing was changed.` +
          (errs ? `\n${errs}` : "") +
          `\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
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
        rulesContent:
          '{"rules": [{"condition": {"impressionCount": {"min": 1000}}, "bid": {"fixedBid": {"bidAmountMicros": "5000000"}}}]}',
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
    cesteral: {
      kind: "write",
      writeClass: "effect",
      executableArgsExclude: ["dry_run"],
      platform: "dv360",
      contractPlatformSlug: "dv360",
      contractToolSlug: "manage_custom_bidding_rules",
      operation: ["manage"],
      entityKinds: [],
      entityIdArgs: ["customBiddingAlgorithmId", "advertiserId", "partnerId"],
      schemaVersion: 1,
      contractId: "dv360.manage_custom_bidding_rules.v1",
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  logic: manageCustomBiddingRulesLogic,
  responseFormatter: manageCustomBiddingRulesResponseFormatter,
};

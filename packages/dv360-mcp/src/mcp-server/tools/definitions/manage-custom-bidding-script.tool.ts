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

const TOOL_NAME = "dv360_manage_custom_bidding_script";
const TOOL_TITLE = "Manage Custom Bidding Script";

const TOOL_DESCRIPTION = `Upload and manage scripts for SCRIPT_BASED custom bidding algorithms (Tier 2 workflow tool).

**Actions:**
- upload: Upload a new script version to the algorithm (currently broken — see below)
- list: List all scripts for an algorithm
- get: Get details of a specific script
- getActive: Get the currently active script

**Required scope:** Pass \`advertiserId\` (algorithm is advertiser-owned) OR \`partnerId\` (algorithm is partner-owned). DV360 returns 403 'permission for partner 0' otherwise.

**Script States:**
- PENDING: Script is being processed by backend
- ACCEPTED: Script is ready for scoring impressions
- REJECTED: Script has errors (check errors field for details)

**Important Notes:**
- Only one script can be active at a time per algorithm
- New uploads automatically become active after ACCEPTED
- Scripts cannot be deleted, only replaced with new versions
- **Known limitation:** the \`upload\` action does not currently work. The DV360 v4 upload protocol is a two-step flow (\`GET :uploadScript\` → returns a Google Cloud Storage resourceName → upload bytes via separate PUT to that URI → \`scripts.create\`), and the simple POST currently used returns 404. Tracking issue: revisit before production use.`;

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
    scriptContent: z.string().optional().describe("Script content (required for upload action)"),
    customBiddingScriptId: z.string().optional().describe("Script ID (required for get action)"),
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
    dryRun: EffectDryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. Nothing was changed."
    ),
    effect: EffectResultSchema.optional().describe(
      "Effect-class result identity (effectKind `custom_bidding_script_managed` + scalar audit summary incl. the action). Present on a confirmed execute."
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "The concrete (operation, entityKind) this call resolved to — `manage` with `canonicalEntityKind: null` (effect class). Present on every response."
    ),
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
  // Effect-class write: custom bidding scripts are not a canonical entity.
  const dispatchedCapability: DispatchedCapability = {
    operation: "manage",
    canonicalEntityKind: null,
  };

  if (input.dry_run === true) {
    return {
      action: input.action,
      customBiddingAlgorithmId: input.customBiddingAlgorithmId ?? "",
      timestamp: new Date().toISOString(),
      dryRun: buildScriptEffectDryRun(input),
      dispatchedCapability,
    };
  }

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

  // DV360's scripts sub-resources require the algorithm's owner scope as a
  // query param. Without it Google defaults to partner 0 and returns 403.
  if (!input.advertiserId && !input.partnerId) {
    throw new McpError(
      JsonRpcErrorCode.InvalidParams,
      "Either advertiserId or partnerId is required to scope script operations to the algorithm's owner."
    );
  }
  const scope = { advertiserId: input.advertiserId, partnerId: input.partnerId };

  const result: ManageCustomBiddingScriptOutput = {
    action: input.action,
    customBiddingAlgorithmId: algorithmId,
    timestamp: new Date().toISOString(),
    effect: {
      effectKind: "custom_bidding_script_managed",
      summary: { action: input.action, algorithm_id: algorithmId },
    },
    dispatchedCapability,
  };

  switch (input.action) {
    case "upload": {
      if (!input.scriptContent) {
        throw new McpError(
          JsonRpcErrorCode.InvalidParams,
          "scriptContent is required for upload action"
        );
      }

      // Step 1: Upload script file
      const uploadResult = await dv360Service.uploadCustomBiddingScript(
        algorithmId,
        input.scriptContent,
        scope,
        context
      );

      // Step 2: Create script resource
      const script = await dv360Service.createCustomBiddingScript(
        algorithmId,
        uploadResult.resourceName,
        scope,
        context
      );

      result.script = {
        customBiddingScriptId: script.customBiddingScriptId,
        createTime: script.createTime ?? "",
        active: script.active ?? false,
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
        scope,
        context
      );

      result.scripts = scripts.map((s) => ({
        customBiddingScriptId: s.customBiddingScriptId,
        createTime: s.createTime ?? "",
        active: s.active ?? false,
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

      const script = await dv360Service.getCustomBiddingScript(
        algorithmId,
        scriptId,
        scope,
        context
      );

      result.script = {
        customBiddingScriptId: script.customBiddingScriptId,
        createTime: script.createTime ?? "",
        active: script.active ?? false,
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
        scope,
        context
      );

      const activeScript = scripts.find((s) => s.active);

      if (activeScript) {
        result.script = {
          customBiddingScriptId: activeScript.customBiddingScriptId,
          createTime: activeScript.createTime ?? "",
          active: activeScript.active ?? false,
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
 * Symbolic effect dry-run for `dv360_manage_custom_bidding_script`. A preview
 * cannot elicit interactively, so action-specific required fields (algorithm id
 * always; scriptContent for upload; script id for get; owner scope) surface as
 * validation errors when absent. Pure (no I/O); never includes scriptContent.
 */
function buildScriptEffectDryRun(input: ManageCustomBiddingScriptInput): EffectDryRunResult {
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
  if (input.action === "upload" && !input.scriptContent)
    errors.push({
      code: "MISSING_FIELD",
      message: "scriptContent is required for the upload action",
      field: "scriptContent",
    });
  if (input.action === "get" && !input.customBiddingScriptId)
    errors.push({
      code: "MISSING_FIELD",
      message: "customBiddingScriptId is required for the get action",
      field: "customBiddingScriptId",
    });

  return assertGovernedEffectDryRun(
    {
      wouldSucceed: errors.length === 0,
      validationErrors: errors,
      validationSource: "symbolic",
      expectedEffectSource: "symbolic",
      expectedEffect: {
        effectKind: "custom_bidding_script_managed",
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
export function manageCustomBiddingScriptResponseFormatter(
  result: ManageCustomBiddingScriptOutput
): McpTextContent[] {
  if (result.dryRun) {
    const { wouldSucceed, validationErrors, validationSource, expectedEffectSource } =
      result.dryRun;
    const errs = validationErrors.map((e) => `  - [${e.code}] ${e.message}`).join("\n");
    return [
      {
        type: "text" as const,
        text:
          `Dry run: custom bidding script ${result.action} ${wouldSucceed ? "would succeed" : "would FAIL"} (validation: ${validationSource}, expected-effect: ${expectedEffectSource}). Nothing was changed.` +
          (errs ? `\n${errs}` : "") +
          `\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
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
        scriptContent:
          "// Custom bidding script v2\nfunction bid(request) {\n  const baseBid = request.floorPrice;\n  const multiplier = request.userList ? 1.5 : 1.0;\n  return baseBid * multiplier;\n}",
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
    cesteral: {
      kind: "write",
      writeClass: "effect",
      executableArgsExclude: ["dry_run"],
      platform: "dv360",
      contractPlatformSlug: "dv360",
      contractToolSlug: "manage_custom_bidding_script",
      operation: ["manage"],
      entityKinds: [],
      entityIdArgs: ["customBiddingAlgorithmId", "advertiserId", "partnerId"],
      schemaVersion: 1,
      contractId: "dv360.manage_custom_bidding_script.v1",
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  logic: manageCustomBiddingScriptLogic,
  responseFormatter: manageCustomBiddingScriptResponseFormatter,
};

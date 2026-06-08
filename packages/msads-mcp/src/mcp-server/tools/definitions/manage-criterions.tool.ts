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
  EffectResult,
  DispatchedCapability,
  CesteralWriteToolAnnotations,
} from "@cesteral/shared";

const TOOL_NAME = "msads_manage_criterions";
const TOOL_TITLE = "Manage Microsoft Ads Targeting Criterions";
const TOOL_DESCRIPTION = `Manage targeting criterions for Microsoft Advertising campaigns and ad groups.

Operations:
- add: Add targeting criterions (location, age, gender, device, etc.)
- update: Update existing criterions (e.g., bid adjustments)
- delete: Remove criterions
- getByCampaign: Get criterions for a campaign
- getByAdGroup: Get criterions for an ad group`;

export const ManageCriterionsInputSchema = z
  .object({
    operation: z
      .enum(["add", "update", "delete", "getByCampaign", "getByAdGroup"])
      .describe("Operation to perform"),
    entityLevel: z
      .enum(["campaign", "adGroup"])
      .describe("Whether targeting is at campaign or ad group level"),
    data: z.record(z.unknown()).describe("Operation data (varies by operation)"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the request and returns an EffectDryRunResult under `dryRun` without calling the Microsoft Ads API. No criterions are changed."
      ),
  })
  .describe("Parameters for managing targeting criterions");

export const ManageCriterionsOutputSchema = z
  .object({
    result: z.record(z.any()).optional(),
    operation: z.string(),
    entityLevel: z.string(),
    timestamp: z.string().datetime(),
    dryRun: EffectDryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. No criterions were changed."
    ),
    effect: EffectResultSchema.optional().describe(
      "Effect-class result identity (effectKind `criterions_managed` + scalar audit summary incl. operation + entity level). Present on a confirmed execute."
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "The concrete (operation, entityKind) this call resolved to — `manage` with `canonicalEntityKind: null` (effect class). Present on every response."
    ),
  })
  .describe("Criterion management result");

type ManageCriterionsInput = z.infer<typeof ManageCriterionsInputSchema>;
type ManageCriterionsOutput = z.infer<typeof ManageCriterionsOutputSchema>;

function getOperation(
  operation: string,
  entityLevel: string
): { path: string; method: "POST" | "PUT" | "DELETE" } {
  const level = entityLevel === "campaign" ? "Campaign" : "AdGroup";
  const ops: Record<string, { path: string; method: "POST" | "PUT" | "DELETE" }> = {
    add: { path: `/${level}Criterions`, method: "POST" },
    update: { path: `/${level}Criterions`, method: "PUT" },
    delete: { path: `/${level}Criterions`, method: "DELETE" },
    getByCampaign: { path: "/CampaignCriterions/QueryByIds", method: "POST" },
    getByAdGroup: { path: "/AdGroupCriterions/QueryByIds", method: "POST" },
  };
  const op = ops[operation];
  if (!op) {
    throw new McpError(JsonRpcErrorCode.InvalidParams, `Unknown criterion operation: ${operation}`);
  }
  return op;
}

export async function manageCriterionsLogic(
  input: ManageCriterionsInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<ManageCriterionsOutput> {
  // Effect-class write: targeting criterions are not a canonical entity.
  const dispatchedCapability: DispatchedCapability = {
    operation: "manage",
    canonicalEntityKind: null,
  };

  if (input.dry_run === true) {
    return {
      operation: input.operation,
      entityLevel: input.entityLevel,
      timestamp: new Date().toISOString(),
      dryRun: assertGovernedEffectDryRun(
        {
          wouldSucceed: true,
          validationErrors: [],
          validationSource: "symbolic",
          expectedEffectSource: "symbolic",
          expectedEffect: {
            effectKind: "criterions_managed",
            summary: { operation: input.operation, entity_level: input.entityLevel },
          },
        },
        TOOL_NAME,
        { requiresValidation: true, requiresSimulation: true }
      ),
      dispatchedCapability,
    };
  }

  const { msadsService } = resolveSessionServices(sdkContext);

  const op = getOperation(input.operation, input.entityLevel);

  const result = (await msadsService.executeOperation(
    op.path,
    input.data,
    context,
    op.method
  )) as Record<string, unknown>;

  // Effect summary carries audit identity only — never the raw criterion data.
  const effect: EffectResult = {
    effectKind: "criterions_managed",
    summary: { operation: input.operation, entity_level: input.entityLevel },
  };

  return {
    result,
    operation: input.operation,
    entityLevel: input.entityLevel,
    timestamp: new Date().toISOString(),
    effect,
    dispatchedCapability,
  };
}

export function manageCriterionsResponseFormatter(
  result: ManageCriterionsOutput
): McpTextContent[] {
  if (result.dryRun) {
    const { wouldSucceed, validationSource, expectedEffectSource } = result.dryRun;
    return [
      {
        type: "text" as const,
        text: `Dry run: ${result.entityLevel} criterion ${result.operation} ${wouldSucceed ? "would succeed" : "would FAIL"} (validation: ${validationSource}, expected-effect: ${expectedEffectSource}). No criterions were changed.\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  return [
    {
      type: "text" as const,
      text: `${result.entityLevel} criterion ${result.operation} completed\n\nResult:\n${JSON.stringify(result.result, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const manageCriterionsTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: ManageCriterionsInputSchema,
  outputSchema: ManageCriterionsOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    idempotentHint: false,
    destructiveHint: true,
    cesteral: {
      kind: "write",
      writeClass: "effect",
      executableArgsExclude: ["dry_run"],
      platform: "msads",
      contractPlatformSlug: "msads",
      contractToolSlug: "manage_criterions",
      operation: ["manage"],
      entityKinds: [],
      entityIdArgs: [],
      schemaVersion: 1,
      contractId: "msads.manage_criterions.v1",
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Get campaign targeting criterions",
      input: {
        operation: "getByCampaign",
        entityLevel: "campaign",
        data: { CampaignId: 123456, CriterionType: "Targets" },
      },
    },
  ],
  logic: manageCriterionsLogic,
  responseFormatter: manageCriterionsResponseFormatter,
};

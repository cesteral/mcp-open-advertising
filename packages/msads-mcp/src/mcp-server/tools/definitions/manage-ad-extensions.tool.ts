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

const TOOL_NAME = "msads_manage_ad_extensions";
const TOOL_TITLE = "Manage Microsoft Ads Ad Extensions";
const TOOL_DESCRIPTION = `Manage ad extensions in Microsoft Advertising — associate/disassociate extensions with campaigns or ad groups.

Operations:
- setAssociations: Link ad extensions to campaigns or ad groups
- deleteAssociations: Remove ad extension associations
- getAssociations: Query ad extension associations for campaigns or ad groups`;

export const ManageAdExtensionsInputSchema = z
  .object({
    operation: z
      .enum(["setAssociations", "deleteAssociations", "getAssociations"])
      .describe("Operation to perform"),
    data: z.record(z.unknown()).describe("Operation data (varies by operation)"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the request and returns an EffectDryRunResult under `dryRun` without calling the Microsoft Ads API. No associations are changed."
      ),
  })
  .describe("Parameters for managing ad extensions");

export const ManageAdExtensionsOutputSchema = z
  .object({
    result: z.record(z.any()).optional(),
    operation: z.string(),
    timestamp: z.string().datetime(),
    dryRun: EffectDryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. No associations were changed."
    ),
    effect: EffectResultSchema.optional().describe(
      "Effect-class result identity (effectKind `ad_extensions_managed` + scalar audit summary). Present on a confirmed execute."
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "The concrete (operation, entityKind) this call resolved to — `manage` with `canonicalEntityKind: null` (effect class). Present on every response."
    ),
  })
  .describe("Ad extension management result");

type ManageAdExtensionsInput = z.infer<typeof ManageAdExtensionsInputSchema>;
type ManageAdExtensionsOutput = z.infer<typeof ManageAdExtensionsOutputSchema>;

const OPERATION_PATHS: Record<string, { path: string; method: "POST" | "PUT" | "DELETE" }> = {
  setAssociations: { path: "/AdExtensionsAssociations", method: "POST" },
  deleteAssociations: { path: "/AdExtensionsAssociations", method: "DELETE" },
  getAssociations: { path: "/AdExtensionsAssociations/Query", method: "POST" },
};

export async function manageAdExtensionsLogic(
  input: ManageAdExtensionsInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<ManageAdExtensionsOutput> {
  // Effect-class write: ad-extension associations are not a canonical entity.
  const dispatchedCapability: DispatchedCapability = {
    operation: "manage",
    canonicalEntityKind: null,
  };

  if (input.dry_run === true) {
    return {
      operation: input.operation,
      timestamp: new Date().toISOString(),
      dryRun: assertGovernedEffectDryRun(
        {
          wouldSucceed: true,
          validationErrors: [],
          validationSource: "symbolic",
          expectedEffectSource: "symbolic",
          expectedEffect: {
            effectKind: "ad_extensions_managed",
            summary: { operation: input.operation },
          },
        },
        TOOL_NAME,
        { requiresValidation: true, requiresSimulation: true }
      ),
      dispatchedCapability,
    };
  }

  const { msadsService } = resolveSessionServices(sdkContext);

  const op = OPERATION_PATHS[input.operation];
  if (!op) {
    throw new McpError(
      JsonRpcErrorCode.InvalidParams,
      `Unknown ad extension operation: ${input.operation}`
    );
  }

  const result = (await msadsService.executeOperation(
    op.path,
    input.data,
    context,
    op.method
  )) as Record<string, unknown>;

  // Effect summary carries audit identity only — never the raw association data.
  const effect: EffectResult = {
    effectKind: "ad_extensions_managed",
    summary: { operation: input.operation },
  };

  return {
    result,
    operation: input.operation,
    timestamp: new Date().toISOString(),
    effect,
    dispatchedCapability,
  };
}

export function manageAdExtensionsResponseFormatter(
  result: ManageAdExtensionsOutput
): McpTextContent[] {
  if (result.dryRun) {
    const { wouldSucceed, validationSource, expectedEffectSource } = result.dryRun;
    return [
      {
        type: "text" as const,
        text: `Dry run: ad extension ${result.operation} ${wouldSucceed ? "would succeed" : "would FAIL"} (validation: ${validationSource}, expected-effect: ${expectedEffectSource}). No associations were changed.\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  return [
    {
      type: "text" as const,
      text: `Ad extension ${result.operation} completed\n\nResult:\n${JSON.stringify(result.result, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const manageAdExtensionsTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: ManageAdExtensionsInputSchema,
  outputSchema: ManageAdExtensionsOutputSchema,
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
      contractToolSlug: "manage_ad_extensions",
      operation: ["manage"],
      entityKinds: [],
      entityIdArgs: [],
      schemaVersion: 1,
      contractId: "msads.manage_ad_extensions.v1",
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Associate sitelink extensions with a campaign",
      input: {
        operation: "setAssociations",
        data: {
          AccountId: 123456,
          AdExtensionIdToEntityIdAssociations: [{ AdExtensionId: 111, EntityId: 222 }],
          AssociationType: "Campaign",
        },
      },
    },
  ],
  logic: manageAdExtensionsLogic,
  responseFormatter: manageAdExtensionsResponseFormatter,
};

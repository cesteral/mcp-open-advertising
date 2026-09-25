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

const TOOL_NAME = "msads_import_from_google";
const TOOL_TITLE = "Import from Google Ads";
const TOOL_DESCRIPTION = `Import campaigns from Google Ads into Microsoft Advertising using the ImportJobs API.

This is a Microsoft Ads-specific feature that allows migrating Google Ads campaigns, ad groups, ads, and keywords into your Microsoft Ads account.

Operations:
- create: Create a new import job — \`{ ImportJobs: [{ Type: "GoogleImportJob", Name, GoogleAccountId, CredentialId }] }\`. GoogleAccountId is the numeric Google Ads customer ID (a long, no dashes); Name and CredentialId are required. The CredentialId authorizes Microsoft Advertising to read the Google Ads account and is obtained through the Microsoft Advertising UI's Google sign-in, not through this tool. One GoogleImportJob per call.
- getStatus: Check import job status — \`{ ImportJobIds: [...], ImportType: "GoogleImportJob" }\`
- getResults: Get import job results — \`{ ImportJobIds: [...], ImportType: "GoogleImportJob" }\``;

export const ImportFromGoogleInputSchema = z
  .object({
    operation: z
      .enum(["create", "getStatus", "getResults"])
      .describe("Import operation to perform"),
    data: z
      .record(z.unknown())
      .describe(
        'Operation data — for create: { ImportJobs: [GoogleImportJob] }; for getStatus/getResults: { ImportJobIds, ImportType: "GoogleImportJob" }'
      ),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the request and returns an EffectDryRunResult under `dryRun` without calling the Microsoft Ads API. Nothing is imported."
      ),
  })
  .describe("Parameters for Google Ads import");

export const ImportFromGoogleOutputSchema = z
  .object({
    result: z.record(z.any()).optional(),
    operation: z.string(),
    timestamp: z.string().datetime(),
    dryRun: EffectDryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. Nothing was imported."
    ),
    effect: EffectResultSchema.optional().describe(
      "Effect-class result identity (effectKind `import_job_managed` + scalar audit summary). Present on a confirmed execute."
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "The concrete (operation, entityKind) this call resolved to — `manage` with `canonicalEntityKind: null` (effect class; a Google Ads import is not a canonical entity). Present on every response."
    ),
  })
  .describe("Import operation result");

type ImportFromGoogleInput = z.infer<typeof ImportFromGoogleInputSchema>;
type ImportFromGoogleOutput = z.infer<typeof ImportFromGoogleOutputSchema>;

/**
 * REST routes per the v13 docs' "Request Url" sections: AddImportJobs → POST
 * /ImportJobs, GetImportJobsByIds → POST /ImportJobs/QueryByIds,
 * GetImportResults → POST /ImportResults/Query. AddImportJobs returns
 * `ImportJobIds` (null for a rejected job) plus `PartialErrors`.
 */
const OPERATION_PATHS: Record<string, string> = {
  create: "/ImportJobs",
  getStatus: "/ImportJobs/QueryByIds",
  getResults: "/ImportResults/Query",
};

export async function importFromGoogleLogic(
  input: ImportFromGoogleInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<ImportFromGoogleOutput> {
  // Effect-class write: a Google Ads import is not a canonical entity.
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
            effectKind: "import_job_managed",
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

  const path = OPERATION_PATHS[input.operation];
  if (!path) {
    throw new McpError(
      JsonRpcErrorCode.InvalidParams,
      `Unknown import operation: ${input.operation}`
    );
  }

  // `create` goes through the PartialErrors mapping: a rejected job (null id
  // and/or PartialErrors on an HTTP 200) throws instead of reporting success.
  let result: Record<string, unknown>;
  let counts: Record<string, number | boolean> = {};
  if (input.operation === "create") {
    const batch = await msadsService.executeOperation(path, input.data, context, "POST", {
      operation: "create import job",
      entityLabel: "Google import jobs",
      itemsField: "ImportJobs",
      idsField: "ImportJobIds",
    });
    result = {
      ...(batch.response && typeof batch.response === "object"
        ? (batch.response as Record<string, unknown>)
        : {}),
      itemFailures: batch.failures,
    };
    counts = {
      requested: batch.requested,
      succeeded: batch.succeeded,
      failed: batch.failed,
      partial_success: batch.failed > 0,
    };
  } else {
    result = (await msadsService.executeOperation(path, input.data, context)) as Record<
      string,
      unknown
    >;
  }

  // Effect summary carries audit identity only — never the raw import config.
  const effect: EffectResult = {
    effectKind: "import_job_managed",
    summary: { operation: input.operation, ...counts },
  };

  return {
    result,
    operation: input.operation,
    timestamp: new Date().toISOString(),
    effect,
    dispatchedCapability,
  };
}

export function importFromGoogleResponseFormatter(
  result: ImportFromGoogleOutput
): McpTextContent[] {
  if (result.dryRun) {
    const { wouldSucceed, validationSource, expectedEffectSource } = result.dryRun;
    return [
      {
        type: "text" as const,
        text: `Dry run: Google Ads import ${result.operation} ${wouldSucceed ? "would succeed" : "would FAIL"} (validation: ${validationSource}, expected-effect: ${expectedEffectSource}). Nothing was imported.\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  return [
    {
      type: "text" as const,
      text: `Google Ads import ${result.operation} completed\n\nResult:\n${JSON.stringify(result.result, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const importFromGoogleTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: ImportFromGoogleInputSchema,
  outputSchema: ImportFromGoogleOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    idempotentHint: false,
    destructiveHint: false,
    cesteral: {
      kind: "write",
      writeClass: "effect",
      executableArgsExclude: ["dry_run"],
      platform: "msads",
      contractPlatformSlug: "msads",
      contractToolSlug: "import_from_google",
      operation: ["manage"],
      entityKinds: [],
      entityIdArgs: [],
      schemaVersion: 1,
      contractId: "msads.import_from_google.v1",
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Create Google Ads import job",
      input: {
        operation: "create",
        data: {
          ImportJobs: [
            {
              Type: "GoogleImportJob",
              Name: "Import from Google Ads",
              GoogleAccountId: 1234567890,
              CredentialId: "<CredentialId from the Microsoft Advertising UI Google sign-in>",
            },
          ],
        },
      },
    },
  ],
  logic: importFromGoogleLogic,
  responseFormatter: importFromGoogleResponseFormatter,
};

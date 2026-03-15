// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent, SdkContext } from "@cesteral/shared";

const TOOL_NAME = "msads_import_from_google";
const TOOL_TITLE = "Import from Google Ads";
const TOOL_DESCRIPTION = `Import campaigns from Google Ads into Microsoft Advertising using the ImportJobs API.

This is a Microsoft Ads-specific feature that allows migrating Google Ads campaigns, ad groups, ads, and keywords into your Microsoft Ads account.

Operations:
- create: Create a new import job
- getStatus: Check import job status
- getResults: Get import job results`;

export const ImportFromGoogleInputSchema = z
  .object({
    operation: z
      .enum(["create", "getStatus", "getResults"])
      .describe("Import operation to perform"),
    data: z
      .record(z.unknown())
      .describe("Operation data — for create: import job config; for getStatus/getResults: { ImportJobId }"),
  })
  .describe("Parameters for Google Ads import");

export const ImportFromGoogleOutputSchema = z
  .object({
    result: z.record(z.any()),
    operation: z.string(),
    timestamp: z.string().datetime(),
  })
  .describe("Import operation result");

type ImportFromGoogleInput = z.infer<typeof ImportFromGoogleInputSchema>;
type ImportFromGoogleOutput = z.infer<typeof ImportFromGoogleOutputSchema>;

const OPERATION_PATHS: Record<string, string> = {
  create: "/ImportJobs/Add",
  getStatus: "/ImportJobs/GetByIds",
  getResults: "/ImportJobs/GetResults",
};

export async function importFromGoogleLogic(
  input: ImportFromGoogleInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<ImportFromGoogleOutput> {
  const { msadsService } = resolveSessionServices(sdkContext);

  const path = OPERATION_PATHS[input.operation];
  if (!path) {
    throw new Error(`Unknown import operation: ${input.operation}`);
  }

  const result = (await msadsService.executeOperation(
    path,
    input.data,
    context
  )) as Record<string, unknown>;

  return {
    result,
    operation: input.operation,
    timestamp: new Date().toISOString(),
  };
}

export function importFromGoogleResponseFormatter(result: ImportFromGoogleOutput): McpTextContent[] {
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
              GoogleAccountId: "123-456-7890",
            },
          ],
        },
      },
    },
  ],
  logic: importFromGoogleLogic,
  responseFormatter: importFromGoogleResponseFormatter,
};
// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent, SdkContext } from "@cesteral/shared";

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
  })
  .describe("Parameters for managing ad extensions");

export const ManageAdExtensionsOutputSchema = z
  .object({
    result: z.record(z.any()),
    operation: z.string(),
    timestamp: z.string().datetime(),
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
  const { msadsService } = resolveSessionServices(sdkContext);

  const op = OPERATION_PATHS[input.operation];
  if (!op) {
    throw new Error(`Unknown ad extension operation: ${input.operation}`);
  }

  const result = (await msadsService.executeOperation(
    op.path,
    input.data,
    context,
    op.method
  )) as Record<string, unknown>;

  return {
    result,
    operation: input.operation,
    timestamp: new Date().toISOString(),
  };
}

export function manageAdExtensionsResponseFormatter(
  result: ManageAdExtensionsOutput
): McpTextContent[] {
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

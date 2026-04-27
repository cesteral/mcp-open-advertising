// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent, SdkContext } from "@cesteral/shared";

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
  })
  .describe("Parameters for managing targeting criterions");

export const ManageCriterionsOutputSchema = z
  .object({
    result: z.record(z.any()),
    operation: z.string(),
    entityLevel: z.string(),
    timestamp: z.string().datetime(),
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
    throw new Error(`Unknown criterion operation: ${operation}`);
  }
  return op;
}

export async function manageCriterionsLogic(
  input: ManageCriterionsInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<ManageCriterionsOutput> {
  const { msadsService } = resolveSessionServices(sdkContext);

  const op = getOperation(input.operation, input.entityLevel);

  const result = (await msadsService.executeOperation(
    op.path,
    input.data,
    context,
    op.method
  )) as Record<string, unknown>;

  return {
    result,
    operation: input.operation,
    entityLevel: input.entityLevel,
    timestamp: new Date().toISOString(),
  };
}

export function manageCriterionsResponseFormatter(
  result: ManageCriterionsOutput
): McpTextContent[] {
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

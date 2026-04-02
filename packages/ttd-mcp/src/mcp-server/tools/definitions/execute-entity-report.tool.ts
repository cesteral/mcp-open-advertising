// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { McpTextContent, RequestContext, SdkContext } from "@cesteral/shared";
import { throwIfGraphqlErrors } from "../utils/graphql-errors.js";

const TOOL_NAME = "ttd_execute_entity_report";
const TOOL_TITLE = "Execute TTD Entity Report (GraphQL)";
const TOOL_DESCRIPTION = `Execute an immediate dimension-specific report for an entity via TTD GraphQL.

Returns a **direct download URL** with no polling required — unlike the MyReports async flow.
These are pre-built report types tied to specific entities (ad group, campaign, or advertiser).

**Report types** vary by entity. Use \`ttd_get_entity_report_types\` to discover available types
for a given entity and Kokai tile (e.g. AD_GROUP, SITE, GEO, DEVICE_TYPE, AD_FORMAT).

**vs. ttd_get_report:** This tool uses the GraphQL API and returns immediately.
\`ttd_get_report\` uses the MyReports REST API with fully custom dimensions/metrics.`;

export const ExecuteEntityReportInputSchema = z
  .object({
    entityType: z
      .enum(["adGroup", "campaign", "advertiser"])
      .describe("The type of entity to generate the report for"),
    entityId: z
      .string()
      .min(1)
      .describe("ID of the entity (ad group, campaign, or advertiser)"),
    reportType: z
      .string()
      .min(1)
      .describe(
        "Report type enum value (e.g. AD_GROUP, SITE, GEO, DEVICE_TYPE, AD_FORMAT, VIDEO_CREATIVE). " +
          "Use ttd_get_entity_report_types to discover available values for your entity."
      ),
  })
  .describe("Parameters for executing an entity-level report via TTD GraphQL");

export const ExecuteEntityReportOutputSchema = z
  .object({
    entityType: z.string(),
    entityId: z.string(),
    reportType: z.string(),
    reportId: z.string().nullable().optional().describe("Report ID if returned"),
    downloadUrl: z.string().optional().describe("Direct download URL for the report CSV"),
    hasSampleData: z.boolean().optional().describe("Whether the report contains sample data"),
    userErrors: z
      .array(z.object({ field: z.string(), message: z.string() }))
      .optional()
      .describe("Validation errors from TTD"),
    rawResponse: z.record(z.unknown()).optional(),
    timestamp: z.string().datetime(),
  })
  .describe("Entity report execution result");

type ExecuteEntityReportInput = z.infer<typeof ExecuteEntityReportInputSchema>;
type ExecuteEntityReportOutput = z.infer<typeof ExecuteEntityReportOutputSchema>;

const MUTATION_KEYS: Record<string, string> = {
  adGroup: "adGroupReportExecute",
  campaign: "campaignReportExecute",
  advertiser: "advertiserReportExecute",
};

export async function executeEntityReportLogic(
  input: ExecuteEntityReportInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<ExecuteEntityReportOutput> {
  const { ttdService } = resolveSessionServices(sdkContext);

  const raw = (await ttdService.executeEntityReport(
    input.entityType,
    input.entityId,
    input.reportType,
    context
  )) as Record<string, unknown>;

  throwIfGraphqlErrors(raw, "GraphQL error executing entity report");

  const mutationKey = MUTATION_KEYS[input.entityType];
  const gqlData = (raw.data as Record<string, unknown> | undefined) ?? {};
  const mutationResult = (gqlData[mutationKey] as Record<string, unknown> | undefined) ?? {};
  const reportData = (mutationResult.data as Record<string, unknown> | undefined) ?? {};
  const userErrors = mutationResult.userErrors as
    | Array<{ field: string; message: string }>
    | undefined;

  return {
    entityType: input.entityType,
    entityId: input.entityId,
    reportType: input.reportType,
    reportId: (reportData.id as string | null) ?? null,
    downloadUrl: reportData.url as string | undefined,
    hasSampleData: reportData.hasSampleData as boolean | undefined,
    userErrors: userErrors?.length ? userErrors : undefined,
    rawResponse: raw as Record<string, unknown>,
    timestamp: new Date().toISOString(),
  };
}

export function executeEntityReportResponseFormatter(
  result: ExecuteEntityReportOutput
): McpTextContent[] {
  if (result.userErrors?.length) {
    return [
      {
        type: "text" as const,
        text:
          `Report execution failed for ${result.entityType} ${result.entityId}:\n\n` +
          result.userErrors.map((e) => `- ${e.field}: ${e.message}`).join("\n") +
          `\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }

  if (result.downloadUrl) {
    return [
      {
        type: "text" as const,
        text:
          `Report ready for ${result.entityType} ${result.entityId} (${result.reportType}):\n\n` +
          `Download URL: ${result.downloadUrl}\n` +
          (result.hasSampleData ? `⚠ Contains sample data only.\n` : "") +
          `\nUse \`ttd_download_report\` with this URL to fetch the CSV data.\n\n` +
          `Timestamp: ${result.timestamp}`,
      },
    ];
  }

  return [
    {
      type: "text" as const,
      text: `Report execution result:\n\n${JSON.stringify(result.rawResponse, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const executeEntityReportTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: ExecuteEntityReportInputSchema,
  outputSchema: ExecuteEntityReportOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: true,
    destructiveHint: false,
    idempotentHint: false,
  },
  inputExamples: [
    {
      label: "Execute ad group report",
      input: {
        entityType: "adGroup",
        entityId: "ag123456",
        reportType: "AD_GROUP",
      },
    },
    {
      label: "Execute campaign geo report",
      input: {
        entityType: "campaign",
        entityId: "c789012",
        reportType: "GEO",
      },
    },
  ],
  logic: executeEntityReportLogic,
  responseFormatter: executeEntityReportResponseFormatter,
};

// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { McpTextContent, RequestContext, SdkContext } from "@cesteral/shared";

const TOOL_NAME = "ttd_get_entity_report_types";
const TOOL_TITLE = "Get TTD Entity Report Types (GraphQL)";
const TOOL_DESCRIPTION = `Discover available dimension-specific report types for a TTD entity.

Returns which report types are available for a given entity and Kokai tile,
and whether each report can be downloaded immediately or requires scheduling.

**tile** is the abbreviation shown in the TTD programmatic table UI (e.g. Ag = Ad Group, Ca = Campaign, Af = Advertiser).
Common tile abbreviations: Ag (Ad Group), Ca (Campaign), Af (Advertiser).

Use the returned \`type\` values with \`ttd_execute_entity_report\` to generate reports.`;

export const GetEntityReportTypesInputSchema = z
  .object({
    entityType: z
      .enum(["adGroup", "campaign", "advertiser"])
      .describe("The type of entity to query report types for"),
    entityId: z
      .string()
      .min(1)
      .describe("ID of the entity"),
    tile: z
      .string()
      .min(1)
      .describe(
        "Kokai tile abbreviation from the TTD programmatic table (e.g. Ag, Ca, Af). " +
          "Controls which dimension-specific report types are returned."
      ),
  })
  .describe("Parameters for querying entity report types via TTD GraphQL");

export const GetEntityReportTypesOutputSchema = z
  .object({
    entityType: z.string(),
    entityId: z.string(),
    tile: z.string(),
    reportTypes: z
      .array(
        z.object({
          type: z.string().describe("Report type value to pass to ttd_execute_entity_report"),
          available: z.boolean().describe("Whether report can be downloaded immediately"),
          schedule: z.boolean().describe("Whether report requires scheduling/email delivery"),
        })
      )
      .describe("Available report types for this entity"),
    userErrors: z
      .array(z.object({ field: z.string(), message: z.string() }))
      .optional(),
    timestamp: z.string().datetime(),
  })
  .describe("Available entity report types");

type GetEntityReportTypesInput = z.infer<typeof GetEntityReportTypesInputSchema>;
type GetEntityReportTypesOutput = z.infer<typeof GetEntityReportTypesOutputSchema>;

export async function getEntityReportTypesLogic(
  input: GetEntityReportTypesInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetEntityReportTypesOutput> {
  const { ttdService } = resolveSessionServices(sdkContext);

  const raw = (await ttdService.getEntityReportMetadata(
    input.entityType,
    input.entityId,
    input.tile,
    context
  )) as Record<string, unknown>;

  const gqlData = (raw.data as Record<string, unknown> | undefined) ?? {};
  const metadata = (gqlData.programmaticTileReportMetadata as Record<string, unknown> | undefined) ?? {};
  const reportTypes = (metadata.data as Array<Record<string, unknown>> | undefined) ?? [];
  const userErrors = metadata.userErrors as Array<{ field: string; message: string }> | undefined;

  return {
    entityType: input.entityType,
    entityId: input.entityId,
    tile: input.tile,
    reportTypes: reportTypes.map((r) => ({
      type: r.type as string,
      available: r.available as boolean,
      schedule: r.schedule as boolean,
    })),
    userErrors: userErrors?.length ? userErrors : undefined,
    timestamp: new Date().toISOString(),
  };
}

export function getEntityReportTypesResponseFormatter(
  result: GetEntityReportTypesOutput
): McpTextContent[] {
  if (result.userErrors?.length) {
    return [
      {
        type: "text" as const,
        text:
          `Could not retrieve report types:\n\n` +
          result.userErrors.map((e) => `- ${e.field}: ${e.message}`).join("\n") +
          `\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }

  if (result.reportTypes.length === 0) {
    return [
      {
        type: "text" as const,
        text: `No report types found for ${result.entityType} ${result.entityId} with tile "${result.tile}".\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }

  const available = result.reportTypes.filter((r) => r.available);
  const scheduled = result.reportTypes.filter((r) => !r.available && r.schedule);

  const lines: string[] = [
    `Report types for ${result.entityType} ${result.entityId} (tile: ${result.tile}):`,
    "",
  ];

  if (available.length > 0) {
    lines.push(`**Immediately downloadable** (use ttd_execute_entity_report):`);
    available.forEach((r) => lines.push(`  - ${r.type}`));
    lines.push("");
  }

  if (scheduled.length > 0) {
    lines.push(`**Requires scheduling** (email delivery):`);
    scheduled.forEach((r) => lines.push(`  - ${r.type}`));
    lines.push("");
  }

  lines.push(`Timestamp: ${result.timestamp}`);

  return [{ type: "text" as const, text: lines.join("\n") }];
}

export const getEntityReportTypesTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: GetEntityReportTypesInputSchema,
  outputSchema: GetEntityReportTypesOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: true,
    destructiveHint: false,
    idempotentHint: true,
  },
  inputExamples: [
    {
      label: "Get ad group report types",
      input: {
        entityType: "adGroup",
        entityId: "ag123456",
        tile: "Ag",
      },
    },
    {
      label: "Get campaign report types",
      input: {
        entityType: "campaign",
        entityId: "c789012",
        tile: "Ca",
      },
    },
  ],
  logic: getEntityReportTypesLogic,
  responseFormatter: getEntityReportTypesResponseFormatter,
};

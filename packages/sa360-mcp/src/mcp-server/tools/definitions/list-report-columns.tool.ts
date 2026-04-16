// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { McpTextContent, RequestContext } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";
import catalogJson from "../../../config/report-columns-catalog.json" with { type: "json" };

const TOOL_NAME = "sa360_list_report_columns";
const TOOL_TITLE = "List SA360 Report Columns";
const TOOL_DESCRIPTION = `List SA360 Reporting API fields for a given resource (campaign, ad_group, ad_group_ad, etc).

Uses the live \`searchAds360Fields\` endpoint when credentials are available; falls back to a static catalog when the live call fails so callers always get a usable discovery surface.

**resource:** one of \`account\`, \`campaign\`, \`ad_group\`, \`ad_group_ad\`, \`ad_group_criterion\`, \`campaign_budget\`, \`conversion\`, \`conversion_action\`, \`customer\`, or a top-level prefix like \`metrics\` or \`segments\`. When omitted, the tool returns the full fallback catalog grouping.

**includeMetrics / includeSegments:** when true (default) and a specific resource is supplied, the response also includes the canonical \`metrics.*\` and \`segments.*\` field groups so you can build a full SELECT clause.

**Related:** \`sa360_search_fields\` for arbitrary queries against the searchAds360Fields endpoint.`;

type Catalog = {
  description: string;
  resources: string[];
  fieldGroups: Record<string, string[]>;
  notes: string[];
};

const catalog = catalogJson as Catalog;

export const ListReportColumnsInputSchema = z
  .object({
    resource: z
      .string()
      .optional()
      .describe(
        "Resource or field-group prefix (e.g. campaign, ad_group, metrics, segments). When omitted, returns the full catalog.",
      ),
    includeMetrics: z
      .boolean()
      .optional()
      .default(true)
      .describe("Include `metrics.*` field group alongside the resource-specific fields"),
    includeSegments: z
      .boolean()
      .optional()
      .default(true)
      .describe("Include `segments.*` field group alongside the resource-specific fields"),
    preferLive: z
      .boolean()
      .optional()
      .default(true)
      .describe(
        "When true (default), try the live searchAds360Fields endpoint first and only fall back to the static catalog on failure.",
      ),
  })
  .describe("Parameters for listing SA360 report columns");

export const ListReportColumnsOutputSchema = z
  .object({
    resource: z.string().nullable(),
    source: z.enum(["live", "catalog"]),
    fields: z
      .array(z.record(z.any()))
      .describe("Field objects. Live results carry name/category/data_type/selectable; catalog results carry {name}."),
    fieldGroups: z
      .record(z.array(z.string()))
      .optional()
      .describe("Static catalog grouping (only present when `source: 'catalog'`)"),
    notes: z.array(z.string()),
    timestamp: z.string().datetime(),
  })
  .describe("SA360 field catalog");

type ListReportColumnsInput = z.infer<typeof ListReportColumnsInputSchema>;
type ListReportColumnsOutput = z.infer<typeof ListReportColumnsOutputSchema>;

function flattenCatalog(
  resource: string | undefined,
  includeMetrics: boolean,
  includeSegments: boolean,
): { fields: Record<string, unknown>[]; fieldGroups: Record<string, string[]> } {
  const groups: Record<string, string[]> = {};
  if (resource && resource in catalog.fieldGroups) {
    groups[resource] = catalog.fieldGroups[resource]!;
    if (includeMetrics && "metrics" in catalog.fieldGroups && resource !== "metrics") {
      groups.metrics = catalog.fieldGroups.metrics!;
    }
    if (includeSegments && "segments" in catalog.fieldGroups && resource !== "segments") {
      groups.segments = catalog.fieldGroups.segments!;
    }
  } else {
    Object.assign(groups, catalog.fieldGroups);
  }
  const fields: Record<string, unknown>[] = [];
  for (const list of Object.values(groups)) {
    for (const name of list) {
      fields.push({ name });
    }
  }
  return { fields, fieldGroups: groups };
}

function buildLiveQuery(resource: string, pageSize: number): string {
  // Use LIKE 'resource.%' so we pick up nested fields too.
  return (
    `SELECT name, category, data_type, selectable, filterable, sortable ` +
    `FROM searchAds360Fields ` +
    `WHERE name LIKE '${resource}.%' ` +
    `LIMIT ${pageSize}`
  );
}

export async function listReportColumnsLogic(
  input: ListReportColumnsInput,
  context: RequestContext,
  sdkContext?: SdkContext,
): Promise<ListReportColumnsOutput> {
  const resource = input.resource?.trim();

  // Try live when a specific resource is provided AND preferLive is on.
  if (resource && input.preferLive !== false) {
    try {
      const { sa360Service } = resolveSessionServices(sdkContext);
      const result = await sa360Service.searchFields(
        buildLiveQuery(resource, 1000),
        1000,
        context,
      );
      const liveFields = result.fields as Record<string, unknown>[];
      if (liveFields.length > 0) {
        return {
          resource,
          source: "live",
          fields: liveFields,
          notes: catalog.notes,
          timestamp: new Date().toISOString(),
        };
      }
      // Empty live result — fall through to catalog.
    } catch {
      // Live call failed (auth, quota, etc.) — fall through to catalog.
    }
  }

  const { fields, fieldGroups } = flattenCatalog(
    resource,
    input.includeMetrics !== false,
    input.includeSegments !== false,
  );
  return {
    resource: resource ?? null,
    source: "catalog",
    fields,
    fieldGroups,
    notes: catalog.notes,
    timestamp: new Date().toISOString(),
  };
}

export function listReportColumnsResponseFormatter(
  result: ListReportColumnsOutput,
): McpTextContent[] {
  const header = `SA360 report columns${result.resource ? ` (resource=${result.resource})` : ""} — source: ${result.source}`;
  const body =
    result.source === "catalog" && result.fieldGroups
      ? Object.entries(result.fieldGroups)
          .map(([group, list]) => `${group} (${list.length}):\n  ${list.join(", ")}`)
          .join("\n\n")
      : `${result.fields.length} field(s):\n${JSON.stringify(result.fields, null, 2)}`;
  const notes = result.notes.length > 0 ? `\n\nNotes:\n- ${result.notes.join("\n- ")}` : "";
  return [
    {
      type: "text" as const,
      text: `${header}\n\n${body}${notes}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const listReportColumnsTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: ListReportColumnsInputSchema,
  outputSchema: ListReportColumnsOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: true,
    destructiveHint: false,
    idempotentHint: true,
  },
  inputExamples: [
    {
      label: "List all catalog groups (no live call)",
      input: { preferLive: false },
    },
    {
      label: "List campaign fields, metrics, and segments",
      input: { resource: "campaign" },
    },
    {
      label: "List only ad_group fields (no metrics/segments)",
      input: { resource: "ad_group", includeMetrics: false, includeSegments: false },
    },
  ],
  logic: listReportColumnsLogic,
  responseFormatter: listReportColumnsResponseFormatter,
};

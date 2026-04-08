# TTD Report Type Discovery Tools — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix false-positive response bugs in template mutation tools and add two report-type discovery tools that eliminate painful manual GraphQL schema exploration.

**Architecture:** Two new read-only tools (`ttd_list_report_types`, `ttd_get_report_type_schema`) wrap TTD GraphQL queries with auto-pagination. Bug fixes add missing-data checks to both template mutation response formatters. Description updates point agents at the new tools instead of raw `ttd_graphql_query`.

**Tech Stack:** TypeScript, Zod, TTD GraphQL API, existing `ttdService.graphqlQuery()` + `throwIfGraphqlErrors()` infrastructure.

---

## Task 1: Fix create-report-template false-positive response

**Files:**
- Modify: `packages/ttd-mcp/src/mcp-server/tools/definitions/create-report-template.tool.ts:125-152`

**What:** The response formatter says "created successfully" even when `templateData` is null/undefined. This happened in production when an `UNAUTHORIZED_FIELD_OR_TYPE` error was swallowed or the mutation returned no data.

**Fix:** In `createReportTemplateResponseFormatter`, after checking for `errors`, check if `templateData` is falsy. If so, return a warning message instead of claiming success.

**Code:**

```typescript
export function createReportTemplateResponseFormatter(
  result: CreateReportTemplateOutput
): McpTextContent[] {
  if (result.errors?.length) {
    return [
      {
        type: "text" as const,
        text:
          `Report template creation failed:\n\n` +
          result.errors
            .map((e) => `- ${e.field ? `${e.field}: ` : ""}${e.message}`)
            .join("\n") +
          `\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }

  if (!result.templateData) {
    return [
      {
        type: "text" as const,
        text:
          `Report template creation returned no template data. The mutation may not have executed.\n\n` +
          `This usually means the API token lacks MyReports write access. ` +
          `Check the raw response for details:\n\n` +
          `${JSON.stringify(result.rawResponse, null, 2)}\n\n` +
          `Timestamp: ${result.timestamp}`,
      },
    ];
  }

  return [
    {
      type: "text" as const,
      text:
        `Report template created successfully.\n\n` +
        `Template data: ${JSON.stringify(result.templateData, null, 2)}\n\n` +
        `Use the template ID with \`ttd_create_template_schedule\` to schedule reports.\n\n` +
        `Timestamp: ${result.timestamp}`,
    },
  ];
}
```

---

## Task 2: Fix update-report-template false-positive response (same bug)

**Files:**
- Modify: `packages/ttd-mcp/src/mcp-server/tools/definitions/update-report-template.tool.ts:118-144`

**What:** Identical bug — says "updated successfully" when `templateData` is null/undefined.

**Code:**

```typescript
export function updateReportTemplateResponseFormatter(
  result: UpdateReportTemplateOutput
): McpTextContent[] {
  if (result.errors?.length) {
    return [
      {
        type: "text" as const,
        text:
          `Report template update failed:\n\n` +
          result.errors
            .map((e) => `- ${e.field ? `${e.field}: ` : ""}${e.message}`)
            .join("\n") +
          `\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }

  if (!result.templateData) {
    return [
      {
        type: "text" as const,
        text:
          `Report template update returned no template data. The mutation may not have executed.\n\n` +
          `This usually means the API token lacks MyReports write access. ` +
          `Check the raw response for details:\n\n` +
          `${JSON.stringify(result.rawResponse, null, 2)}\n\n` +
          `Timestamp: ${result.timestamp}`,
      },
    ];
  }

  return [
    {
      type: "text" as const,
      text:
        `Report template updated successfully.\n\n` +
        `Template data: ${JSON.stringify(result.templateData, null, 2)}\n\n` +
        `Timestamp: ${result.timestamp}`,
    },
  ];
}
```

---

## Task 3: Create `ttd_list_report_types` tool

**Files:**
- Create: `packages/ttd-mcp/src/mcp-server/tools/definitions/list-report-types.tool.ts`

**What:** Wraps `reportTypes(input: { format: $format })` so agents can discover available report types without raw GraphQL. Returns `{ id, name }` for all types.

**Code:**

```typescript
// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { McpTextContent, RequestContext, SdkContext } from "@cesteral/shared";
import { throwIfGraphqlErrors } from "../utils/graphql-errors.js";

const TOOL_NAME = "ttd_list_report_types";
const TOOL_TITLE = "List TTD Report Types (GraphQL)";
const TOOL_DESCRIPTION = `List all available report types from the TTD GraphQL API.

Returns the ID and name of each report type. Use the returned report type ID with \`ttd_get_report_type_schema\` to discover the available fields and metrics for that report type, then use those IDs when building a report template with \`ttd_create_report_template\`.`;

export const ListReportTypesInputSchema = z
  .object({
    format: z
      .enum(["EXCEL"])
      .default("EXCEL")
      .describe("Report format (currently only EXCEL is supported)"),
  })
  .describe("Parameters for listing TTD report types");

const ReportTypeItemSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const ListReportTypesOutputSchema = z
  .object({
    reportTypes: z.array(ReportTypeItemSchema).describe("Available report types"),
    count: z.number().describe("Number of report types returned"),
    timestamp: z.string().datetime(),
  })
  .describe("List of available TTD report types");

type ListReportTypesInput = z.infer<typeof ListReportTypesInputSchema>;
type ListReportTypesOutput = z.infer<typeof ListReportTypesOutputSchema>;

const LIST_REPORT_TYPES_QUERY = `query ListReportTypes($input: ReportTypesInput!) {
  reportTypes(input: $input) {
    id
    name
  }
}`;

export async function listReportTypesLogic(
  input: ListReportTypesInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<ListReportTypesOutput> {
  const { ttdService } = resolveSessionServices(sdkContext);

  const raw = (await ttdService.graphqlQuery(
    LIST_REPORT_TYPES_QUERY,
    { input: { format: input.format } },
    context
  )) as Record<string, unknown>;

  throwIfGraphqlErrors(raw, "GraphQL error listing report types");

  const gqlData = (raw.data as Record<string, unknown> | undefined) ?? {};
  const reportTypes = (gqlData.reportTypes as Array<{ id: string; name: string }>) ?? [];

  return {
    reportTypes,
    count: reportTypes.length,
    timestamp: new Date().toISOString(),
  };
}

export function listReportTypesResponseFormatter(
  result: ListReportTypesOutput
): McpTextContent[] {
  if (result.reportTypes.length === 0) {
    return [
      {
        type: "text" as const,
        text: `No report types found for the specified format.\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }

  const lines = result.reportTypes
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((rt) => `- ${rt.name} (ID: ${rt.id})`);

  return [
    {
      type: "text" as const,
      text:
        `Found ${result.count} report types:\n\n` +
        lines.join("\n") +
        `\n\nUse \`ttd_get_report_type_schema\` with a report type ID to see its available fields and metrics.\n\n` +
        `Timestamp: ${result.timestamp}`,
    },
  ];
}

export const listReportTypesTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: ListReportTypesInputSchema,
  outputSchema: ListReportTypesOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: true,
    destructiveHint: false,
    idempotentHint: true,
  },
  inputExamples: [
    {
      label: "List all available report types",
      input: { format: "EXCEL" },
    },
  ],
  logic: listReportTypesLogic,
  responseFormatter: listReportTypesResponseFormatter,
};
```

---

## Task 4: Create `ttd_get_report_type_schema` tool

**Files:**
- Create: `packages/ttd-mcp/src/mcp-server/tools/definitions/get-report-type-schema.tool.ts`

**What:** Wraps `reportType(input: { format, reportTypeId })` with **auto-pagination** for both fields and metrics. Returns the full list of column IDs needed to build report templates.

**Critical:** The transcript showed default pagination truncating to 10 items. This tool must paginate using `first`/`after` cursor args on both `fields` and `metrics` connections until `hasNextPage` is false.

**Code:**

```typescript
// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { McpTextContent, RequestContext, SdkContext } from "@cesteral/shared";
import { throwIfGraphqlErrors } from "../utils/graphql-errors.js";

const TOOL_NAME = "ttd_get_report_type_schema";
const TOOL_TITLE = "Get TTD Report Type Schema (GraphQL)";
const TOOL_DESCRIPTION = `Get the full field and metric schema for a TTD report type.

Returns all available dimension fields and metrics with their IDs and names. Use these IDs when building report templates with \`ttd_create_report_template\` or \`ttd_update_report_template\`.

Auto-paginates to return ALL fields and metrics (the GraphQL API paginates by default).

Use \`ttd_list_report_types\` first to discover available report type IDs.`;

export const GetReportTypeSchemaInputSchema = z
  .object({
    reportTypeId: z.string().min(1).describe("Report type ID (from ttd_list_report_types)"),
    format: z
      .enum(["EXCEL"])
      .default("EXCEL")
      .describe("Report format (currently only EXCEL is supported)"),
  })
  .describe("Parameters for getting a TTD report type schema");

const SchemaColumnSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const GetReportTypeSchemaOutputSchema = z
  .object({
    reportTypeId: z.string(),
    reportTypeName: z.string(),
    fields: z.array(SchemaColumnSchema).describe("Dimension fields available for this report type"),
    metrics: z.array(SchemaColumnSchema).describe("Metrics available for this report type"),
    timestamp: z.string().datetime(),
  })
  .describe("Full field and metric schema for a TTD report type");

type GetReportTypeSchemaInput = z.infer<typeof GetReportTypeSchemaInputSchema>;
type GetReportTypeSchemaOutput = z.infer<typeof GetReportTypeSchemaOutputSchema>;

const PAGE_SIZE = 100;

const GET_REPORT_TYPE_SCHEMA_QUERY = `query GetReportTypeSchema(
  $input: ReportTypeInput!,
  $fieldsFirst: Int,
  $fieldsAfter: String,
  $metricsFirst: Int,
  $metricsAfter: String
) {
  reportType(input: $input) {
    id
    name
    fields(first: $fieldsFirst, after: $fieldsAfter) {
      pageInfo { hasNextPage endCursor }
      nodes { id name }
    }
    metrics(first: $metricsFirst, after: $metricsAfter) {
      pageInfo { hasNextPage endCursor }
      nodes { id name }
    }
  }
}`;

// Paginate a single connection (fields or metrics) independently
const PAGINATE_FIELDS_QUERY = `query PaginateFields($input: ReportTypeInput!, $first: Int, $after: String) {
  reportType(input: $input) {
    fields(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes { id name }
    }
  }
}`;

const PAGINATE_METRICS_QUERY = `query PaginateMetrics($input: ReportTypeInput!, $first: Int, $after: String) {
  reportType(input: $input) {
    metrics(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes { id name }
    }
  }
}`;

interface ConnectionPage {
  pageInfo?: { hasNextPage?: boolean; endCursor?: string };
  nodes?: Array<{ id: string; name: string }>;
}

export async function getReportTypeSchemaLogic(
  input: GetReportTypeSchemaInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetReportTypeSchemaOutput> {
  const { ttdService } = resolveSessionServices(sdkContext);

  const gqlInput = { format: input.format, reportTypeId: input.reportTypeId };

  // First request: get report type info + first page of both fields and metrics
  const raw = (await ttdService.graphqlQuery(
    GET_REPORT_TYPE_SCHEMA_QUERY,
    {
      input: gqlInput,
      fieldsFirst: PAGE_SIZE,
      fieldsAfter: null,
      metricsFirst: PAGE_SIZE,
      metricsAfter: null,
    },
    context
  )) as Record<string, unknown>;

  throwIfGraphqlErrors(raw, "GraphQL error fetching report type schema");

  const gqlData = (raw.data as Record<string, unknown> | undefined) ?? {};
  const reportType = (gqlData.reportType as Record<string, unknown> | undefined) ?? {};

  const reportTypeId = (reportType.id as string) ?? input.reportTypeId;
  const reportTypeName = (reportType.name as string) ?? "Unknown";

  // Collect fields with pagination
  const fieldsConnection = (reportType.fields as ConnectionPage) ?? {};
  const allFields: Array<{ id: string; name: string }> = [
    ...(fieldsConnection.nodes ?? []),
  ];
  let fieldsHasNext = fieldsConnection.pageInfo?.hasNextPage ?? false;
  let fieldsAfter = fieldsConnection.pageInfo?.endCursor;

  while (fieldsHasNext && fieldsAfter) {
    const page = (await ttdService.graphqlQuery(
      PAGINATE_FIELDS_QUERY,
      { input: gqlInput, first: PAGE_SIZE, after: fieldsAfter },
      context
    )) as Record<string, unknown>;
    throwIfGraphqlErrors(page, "GraphQL error paginating report type fields");
    const pageData = (page.data as Record<string, unknown> | undefined) ?? {};
    const pageReportType = (pageData.reportType as Record<string, unknown> | undefined) ?? {};
    const conn = (pageReportType.fields as ConnectionPage) ?? {};
    allFields.push(...(conn.nodes ?? []));
    fieldsHasNext = conn.pageInfo?.hasNextPage ?? false;
    fieldsAfter = conn.pageInfo?.endCursor;
  }

  // Collect metrics with pagination
  const metricsConnection = (reportType.metrics as ConnectionPage) ?? {};
  const allMetrics: Array<{ id: string; name: string }> = [
    ...(metricsConnection.nodes ?? []),
  ];
  let metricsHasNext = metricsConnection.pageInfo?.hasNextPage ?? false;
  let metricsAfter = metricsConnection.pageInfo?.endCursor;

  while (metricsHasNext && metricsAfter) {
    const page = (await ttdService.graphqlQuery(
      PAGINATE_METRICS_QUERY,
      { input: gqlInput, first: PAGE_SIZE, after: metricsAfter },
      context
    )) as Record<string, unknown>;
    throwIfGraphqlErrors(page, "GraphQL error paginating report type metrics");
    const pageData = (page.data as Record<string, unknown> | undefined) ?? {};
    const pageReportType = (pageData.reportType as Record<string, unknown> | undefined) ?? {};
    const conn = (pageReportType.metrics as ConnectionPage) ?? {};
    allMetrics.push(...(conn.nodes ?? []));
    metricsHasNext = conn.pageInfo?.hasNextPage ?? false;
    metricsAfter = conn.pageInfo?.endCursor;
  }

  return {
    reportTypeId,
    reportTypeName,
    fields: allFields,
    metrics: allMetrics,
    timestamp: new Date().toISOString(),
  };
}

export function getReportTypeSchemaResponseFormatter(
  result: GetReportTypeSchemaOutput
): McpTextContent[] {
  const fieldLines = result.fields
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((f) => `  - ${f.name} (ID: ${f.id})`);

  const metricLines = result.metrics
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((m) => `  - ${m.name} (ID: ${m.id})`);

  return [
    {
      type: "text" as const,
      text:
        `Report Type: ${result.reportTypeName} (ID: ${result.reportTypeId})\n\n` +
        `Fields (${result.fields.length} dimensions):\n${fieldLines.join("\n")}\n\n` +
        `Metrics (${result.metrics.length}):\n${metricLines.join("\n")}\n\n` +
        `Use these IDs with \`ttd_create_report_template\` or \`ttd_update_report_template\` ` +
        `to build report templates.\n\n` +
        `Timestamp: ${result.timestamp}`,
    },
  ];
}

export const getReportTypeSchemaTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: GetReportTypeSchemaInputSchema,
  outputSchema: GetReportTypeSchemaOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: true,
    destructiveHint: false,
    idempotentHint: true,
  },
  inputExamples: [
    {
      label: "Get schema for Performance (100 days) report type",
      input: { reportTypeId: "1", format: "EXCEL" },
    },
    {
      label: "Get schema for Data Element report type",
      input: { reportTypeId: "2" },
    },
  ],
  logic: getReportTypeSchemaLogic,
  responseFormatter: getReportTypeSchemaResponseFormatter,
};
```

---

## Task 5: Update create/update template descriptions

**Files:**
- Modify: `packages/ttd-mcp/src/mcp-server/tools/definitions/create-report-template.tool.ts:14-24`
- Modify: `packages/ttd-mcp/src/mcp-server/tools/definitions/update-report-template.tool.ts:14-19`

**What:** Replace references to `ttd_graphql_query` for schema discovery with the new dedicated tools.

**create-report-template.tool.ts** — replace workflow steps:
```
**Workflow:**
1. Use \`ttd_list_report_types\` to discover available report type IDs
2. Use \`ttd_get_report_type_schema\` to get field and metric IDs for a report type
3. Call this tool to create the template
4. Use the returned template ID to schedule reports (\`ttd_create_template_schedule\`)
```

**update-report-template.tool.ts** — add discovery guidance:
```
Use \`ttd_get_report_template\` first to retrieve the current template structure before updating.
Use \`ttd_list_report_templates\` to find the template ID.
Use \`ttd_list_report_types\` and \`ttd_get_report_type_schema\` to discover available fields and metrics.
```

---

## Task 6: Register new tools in definitions/index.ts

**Files:**
- Modify: `packages/ttd-mcp/src/mcp-server/tools/definitions/index.ts`

**What:** Add exports + imports for both new tools. Add them to the `productionTools` array under a "Report Type Discovery" comment. Update the tool count comment.

---

## Task 7: Build and typecheck

**Run:**
```bash
cd packages/ttd-mcp && pnpm run build && pnpm run typecheck
```

Fix any TypeScript errors that arise.

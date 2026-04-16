// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import type { McpTextContent, RequestContext } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";
import catalogJson from "../../../config/insights-catalog.json" with { type: "json" };

const TOOL_NAME = "meta_get_available_metrics";
const TOOL_TITLE = "Get Meta Available Metrics & Breakdowns";
const TOOL_DESCRIPTION = `List the Meta Marketing API Insights metrics, breakdowns, and action breakdowns available for a given entity level.

Use this before calling \`meta_get_insights\` or \`meta_get_insights_breakdowns\` to discover valid field names.

**levels:** account, campaign, adset, ad — the entity level you plan to report on.

The response groups metrics by semantic category (delivery, engagement, video, conversions, attribution, quality, other) so you can quickly pick the fields that match what you care about. Breakdowns and action breakdowns are returned as flat lists.

**Source:** Meta Marketing API v24.0+ static catalog, seeded from Meta's public docs. Call the live field-introspection endpoint for the authoritative current list.`;

type InsightsCatalog = {
  description: string;
  levels: string[];
  metrics: Record<string, string[]>;
  breakdowns: string[];
  actionBreakdowns: string[];
  notes: string[];
};

const catalog = catalogJson as InsightsCatalog;

export const GetAvailableMetricsInputSchema = z
  .object({
    level: z
      .enum(["account", "campaign", "adset", "ad"])
      .optional()
      .describe(
        "Entity level you plan to report on. Currently the catalog is identical across levels; the parameter is retained so callers can adopt level-specific filtering in a future revision without a breaking change.",
      ),
  })
  .describe("Parameters for listing available Meta insights fields");

export const GetAvailableMetricsOutputSchema = z
  .object({
    level: z.string().nullable().describe("Level the response was scoped to (null when not provided)"),
    metrics: z
      .record(z.array(z.string()))
      .describe("Metric field names grouped by semantic category"),
    breakdowns: z.array(z.string()).describe("Valid `breakdowns` values"),
    actionBreakdowns: z.array(z.string()).describe("Valid `action_breakdowns` values"),
    notes: z.array(z.string()).describe("Catalog caveats worth surfacing to the model"),
    timestamp: z.string().datetime(),
  })
  .describe("Meta insights field catalog");

type GetAvailableMetricsInput = z.infer<typeof GetAvailableMetricsInputSchema>;
type GetAvailableMetricsOutput = z.infer<typeof GetAvailableMetricsOutputSchema>;

export async function getAvailableMetricsLogic(
  input: GetAvailableMetricsInput,
  _context: RequestContext,
  _sdkContext?: SdkContext,
): Promise<GetAvailableMetricsOutput> {
  return {
    level: input.level ?? null,
    metrics: catalog.metrics,
    breakdowns: catalog.breakdowns,
    actionBreakdowns: catalog.actionBreakdowns,
    notes: catalog.notes,
    timestamp: new Date().toISOString(),
  };
}

export function getAvailableMetricsResponseFormatter(
  result: GetAvailableMetricsOutput,
): McpTextContent[] {
  const metricLines = Object.entries(result.metrics)
    .map(([group, list]) => `${group} (${list.length}):\n  ${list.join(", ")}`)
    .join("\n\n");
  const text =
    `Meta insights catalog${result.level ? ` (level=${result.level})` : ""}\n\n` +
    `Metrics by group:\n${metricLines}\n\n` +
    `Breakdowns (${result.breakdowns.length}): ${result.breakdowns.join(", ")}\n\n` +
    `Action breakdowns (${result.actionBreakdowns.length}): ${result.actionBreakdowns.join(", ")}\n\n` +
    (result.notes.length > 0 ? `Notes:\n- ${result.notes.join("\n- ")}\n\n` : "") +
    `Timestamp: ${result.timestamp}`;
  return [{ type: "text" as const, text }];
}

export const getAvailableMetricsTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: GetAvailableMetricsInputSchema,
  outputSchema: GetAvailableMetricsOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    destructiveHint: false,
    idempotentHint: true,
  },
  inputExamples: [
    {
      label: "List all available metrics",
      input: {},
    },
    {
      label: "Scope the catalog to campaign-level reporting",
      input: { level: "campaign" },
    },
  ],
  logic: getAvailableMetricsLogic,
  responseFormatter: getAvailableMetricsResponseFormatter,
};

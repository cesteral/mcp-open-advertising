// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { JsonRpcErrorCode, McpError } from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "sa360_get_change_history";
const TOOL_TITLE = "Get SA360 Change History";
const TOOL_DESCRIPTION = `UNAVAILABLE on the pinned SA360 Reporting API v0 — every call returns an error explaining why.

SA360 change history lives in the \`change_event\` resource, which Reporting API v0 does not expose (its SearchAds360Row has no change_event or change_status resource). This tool performs no API call.

**Alternative:** to find recently modified entities, use \`sa360_gaql_search\` with the \`last_modified_time\` field that v0 exposes on campaign, ad_group, ad_group_ad, ad_group_criterion and campaign_criterion (e.g. \`SELECT campaign.id, campaign.name, campaign.last_modified_time FROM campaign\`). That returns when an entity last changed, not what changed.`;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `ChangeEvent.changeResourceType` values as published for SA360 `change_event`
 * (searchads360 v23 Discovery). Retained so the input contract is valid if the
 * tool is re-enabled on an API version that exposes `change_event`.
 */
const RESOURCE_TYPE_ENUM = [
  "AD",
  "AD_GROUP",
  "AD_GROUP_AD",
  "AD_GROUP_CRITERION",
  "AD_GROUP_BID_MODIFIER",
  "CAMPAIGN",
  "CAMPAIGN_BUDGET",
  "CAMPAIGN_CRITERION",
  "ASSET",
  "CUSTOMER_ASSET",
  "CAMPAIGN_ASSET",
  "AD_GROUP_ASSET",
  "ASSET_SET",
  "ASSET_SET_ASSET",
  "CAMPAIGN_ASSET_SET",
] as const;

export const GetChangeHistoryInputSchema = z
  .object({
    customerId: z
      .string()
      .regex(/^\d+$/, "customerId must be numeric")
      .describe("SA360 customer ID (no dashes)"),
    startDate: z
      .string()
      .regex(DATE_PATTERN, "startDate must be YYYY-MM-DD")
      .describe("Start date for change history (YYYY-MM-DD)"),
    endDate: z
      .string()
      .regex(DATE_PATTERN, "endDate must be YYYY-MM-DD")
      .describe("End date for change history (YYYY-MM-DD)"),
    resourceType: z
      .enum(RESOURCE_TYPE_ENUM)
      .optional()
      .describe("Filter to a specific changed resource type"),
    limit: z
      .number()
      .min(1)
      .max(10000)
      .optional()
      .default(100)
      .describe("Max results to return (default 100)"),
  })
  .describe("Parameters for getting SA360 change history");

export const GetChangeHistoryOutputSchema = z
  .object({
    changes: z.array(z.record(z.any())).describe("Change event records"),
    totalChanges: z.number().describe("Number of changes returned"),
    timestamp: z.string().datetime(),
  })
  .describe("Change history results");

type GetChangeHistoryInput = z.infer<typeof GetChangeHistoryInputSchema>;
type GetChangeHistoryOutput = z.infer<typeof GetChangeHistoryOutputSchema>;

export const CHANGE_HISTORY_UNAVAILABLE_MESSAGE =
  "sa360_get_change_history is unavailable: SA360 Reporting API v0 (the version this server " +
  "is pinned to) has no change_event resource, so change history cannot be queried. To find " +
  "recently modified entities, use sa360_gaql_search with <resource>.last_modified_time " +
  "(available on campaign, ad_group, ad_group_ad, ad_group_criterion and campaign_criterion).";

/**
 * Always throws. Querying `FROM change_event` against v0 can only fail with a
 * query error, so the tool refuses up front with an actionable message instead
 * of spending an API call and surfacing an opaque upstream error.
 */
export async function getChangeHistoryLogic(
  _input: GetChangeHistoryInput,
  _context: RequestContext,
  _sdkContext?: SdkContext
): Promise<GetChangeHistoryOutput> {
  throw new McpError(JsonRpcErrorCode.InvalidRequest, CHANGE_HISTORY_UNAVAILABLE_MESSAGE, {
    reason: "resource_not_in_api_version",
    resource: "change_event",
    apiVersion: "v0",
    alternativeTool: "sa360_gaql_search",
  });
}

export function getChangeHistoryResponseFormatter(
  result: GetChangeHistoryOutput
): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Change history: ${result.totalChanges} change(s) found\n\n${JSON.stringify(result.changes, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const getChangeHistoryTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: GetChangeHistoryInputSchema,
  outputSchema: GetChangeHistoryOutputSchema,
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: true,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Recent campaign changes",
      input: {
        customerId: "1234567890",
        startDate: "2026-03-01",
        endDate: "2026-03-16",
        resourceType: "CAMPAIGN",
        limit: 50,
      },
    },
    {
      label: "All changes in last week",
      input: {
        customerId: "1234567890",
        startDate: "2026-03-09",
        endDate: "2026-03-16",
      },
    },
  ],
  logic: getChangeHistoryLogic,
  responseFormatter: getChangeHistoryResponseFormatter,
};

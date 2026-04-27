// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

/**
 * TTD Bulk Operations Workflow Prompt
 *
 * Guides AI agents through batch create, update, status change, archive,
 * bid adjustment, and GraphQL bulk operations in The Trade Desk.
 */
export const bulkOperationsWorkflowPrompt: Prompt = {
  name: "ttd_bulk_operations_workflow",
  description:
    "Step-by-step guide for TTD bulk operations: batch create/update campaigns and ad groups, batch status changes, archive entities, batch bid adjustments, and GraphQL bulk jobs. Covers PUT semantics, partial failure handling, and verification.",
  arguments: [
    {
      name: "advertiserId",
      description: "TTD Advertiser ID",
      required: true,
    },
    {
      name: "operation",
      description:
        "Operation type: 'create', 'update', 'status', 'archive', 'bids', or 'graphql' (default: status)",
      required: false,
    },
  ],
};

export function getBulkOperationsWorkflowMessage(args?: Record<string, string>): string {
  const advertiserId = args?.advertiserId || "{advertiserId}";
  const operation = args?.operation || "status";

  return `# TTD Bulk Operations Workflow

Advertiser: \`${advertiserId}\`
Operation: \`${operation}\`

---

## Overview

TTD supports these bulk operation tools:

| Tool | Purpose | Max Items |
|------|---------|-----------|
| \`ttd_bulk_create_entities\` | Create multiple campaigns or ad groups | 50 |
| \`ttd_bulk_update_entities\` | Update multiple campaigns or ad groups (PUT) | 50 |
| \`ttd_bulk_update_status\` | Change status: Available, Paused, Archived | 100 |
| \`ttd_archive_entities\` | Archive (soft-delete) campaigns or ad groups | 100 |
| \`ttd_adjust_bids\` | Adjust ad group bid CPMs | 50 |
| \`ttd_graphql_query_bulk\` | Bulk GraphQL queries (async job) | per job limits |
| \`ttd_graphql_mutation_bulk\` | Bulk GraphQL mutations (async, non-cancelable) | 1000 |

---

## Bulk Status Updates

### Step 1: Identify Entities

\`\`\`json
{
  "tool": "ttd_list_entities",
  "params": {
    "entityType": "adGroup",
    "advertiserId": "${advertiserId}",
    "campaignId": "{campaignId}"
  }
}
\`\`\`

### Step 2: Execute Status Change

\`\`\`json
{
  "tool": "ttd_bulk_update_status",
  "params": {
    "entityType": "adGroup",
    "entityIds": ["{adGroupId1}", "{adGroupId2}", "{adGroupId3}"],
    "status": "Paused"
  }
}
\`\`\`

Valid statuses: \`Available\`, \`Paused\`, \`Archived\`

⚠️ **GOTCHA**: TTD uses "Available" (not "Active") for the active state.

⚠️ **GOTCHA**: Archiving is **irreversible** — use \`ttd_archive_entities\` or set status to "Archived". Cannot be un-archived.

---

## Bulk Entity Creation

### Step 1: Fetch Schema

**Resource:** \`entity-schema://{entityType}\` and \`entity-examples://{entityType}\`

### Step 2: Build and Execute

\`\`\`json
{
  "tool": "ttd_bulk_create_entities",
  "params": {
    "entityType": "adGroup",
    "advertiserId": "${advertiserId}",
    "campaignId": "{campaignId}",
    "items": [
      {
        "AdGroupName": "Ad Group - US Targeting",
        "BaseBidCPM": { "Amount": 5.00, "CurrencyCode": "USD" },
        "MaxBidCPM": { "Amount": 10.00, "CurrencyCode": "USD" },
        "RTBAttributes": {
          "BudgetSettings": {
            "DailyBudget": { "Amount": 100.00, "CurrencyCode": "USD" }
          }
        }
      },
      {
        "AdGroupName": "Ad Group - UK Targeting",
        "BaseBidCPM": { "Amount": 4.00, "CurrencyCode": "USD" },
        "MaxBidCPM": { "Amount": 8.00, "CurrencyCode": "USD" },
        "RTBAttributes": {
          "BudgetSettings": {
            "DailyBudget": { "Amount": 75.00, "CurrencyCode": "USD" }
          }
        }
      }
    ]
  }
}
\`\`\`

⚠️ **GOTCHA**: \`RTBAttributes\` is required for ad groups and must include budget settings.

---

## Bulk Entity Updates

### Step 1: Fetch Current State

TTD uses **PUT semantics** — the entire entity is replaced. You MUST fetch the current entity first, merge your changes, then send the full payload.

\`\`\`json
{
  "tool": "ttd_get_entity",
  "params": {
    "entityType": "adGroup",
    "entityId": "{adGroupId}"
  }
}
\`\`\`

### Step 2: Merge and Execute

\`\`\`json
{
  "tool": "ttd_bulk_update_entities",
  "params": {
    "entityType": "adGroup",
    "advertiserId": "${advertiserId}",
    "campaignId": "{campaignId}",
    "items": [
      {
        "entityId": "{adGroupId1}",
        "data": { "...full entity with your changes merged in..." }
      },
      {
        "entityId": "{adGroupId2}",
        "data": { "...full entity with your changes merged in..." }
      }
    ]
  }
}
\`\`\`

⚠️ **GOTCHA**: Unlike DV360 (PATCH with updateMask), TTD uses **PUT** (full replacement). Omitting a field resets it to default. Always GET first, then merge changes.

---

## Archive Entities

For permanent soft-deletion:

\`\`\`json
{
  "tool": "ttd_archive_entities",
  "params": {
    "entityType": "campaign",
    "entityIds": ["{campaignId1}", "{campaignId2}"]
  }
}
\`\`\`

⚠️ **WARNING**: Archiving is irreversible. Consider pausing first if you might want to reactivate later.

---

## Batch Bid Adjustments

### Step 1: Review Current Bids

\`\`\`json
{
  "tool": "ttd_list_entities",
  "params": {
    "entityType": "adGroup",
    "advertiserId": "${advertiserId}",
    "campaignId": "{campaignId}"
  }
}
\`\`\`

Note the current \`BaseBidCPM\` and \`MaxBidCPM\` for each ad group.

### Step 2: Execute Adjustments

TTD bids are in **dollars** (not micros like DV360/Google Ads).

\`\`\`json
{
  "tool": "ttd_adjust_bids",
  "params": {
    "adjustments": [
      {
        "adGroupId": "{adGroupId1}",
        "baseBidCpm": 6.50,
        "maxBidCpm": 12.00
      },
      {
        "adGroupId": "{adGroupId2}",
        "baseBidCpm": 5.25,
        "maxBidCpm": 10.00
      }
    ]
  }
}
\`\`\`

⚠️ **GOTCHA**: TTD bids are in **dollars** (e.g., 5.00 = $5.00 CPM), not micros or cents. This differs from DV360 (micros) and Meta (cents).

---

## GraphQL Bulk Jobs (Advanced)

For large-scale operations beyond REST API limits.

### Bulk Query

\`\`\`json
{
  "tool": "ttd_graphql_query_bulk",
  "params": {
    "query": "query GetAdGroup(\$adGroupId: ID!) { adGroup(id: \$adGroupId) { name status } }",
    "variables": [
      { "adGroupId": "{id1}" },
      { "adGroupId": "{id2}" }
    ]
  }
}
\`\`\`

### Check Job Status

\`\`\`json
{
  "tool": "ttd_graphql_bulk_job",
  "params": { "jobId": "{jobId}" }
}
\`\`\`

### Cancel Query Job

\`\`\`json
{
  "tool": "ttd_graphql_cancel_bulk_job",
  "params": { "jobId": "{jobId}" }
}
\`\`\`

⚠️ **GOTCHA**: Bulk **mutation** jobs are **non-cancelable** once submitted. Double-check inputs before submitting.

⚠️ **GOTCHA**: Result URLs expire after **1 hour**. Download promptly.

⚠️ **GOTCHA**: Max 10 active / 20 queued jobs per partner.

---

## Safety Checklist

- [ ] Correct \`advertiserId\`
- [ ] Entity IDs verified by listing first
- [ ] For updates: GET current entity first (PUT semantics = full replacement)
- [ ] For archive: confirmed irreversibility with user
- [ ] For bids: amounts in dollars (not micros or cents)
- [ ] For GraphQL mutations: inputs double-checked (non-cancelable)
- [ ] Partial failure results reviewed before proceeding
`;
}

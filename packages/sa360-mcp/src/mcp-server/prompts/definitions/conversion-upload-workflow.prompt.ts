// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const conversionUploadWorkflowPrompt: Prompt = {
  name: "sa360_conversion_upload_workflow",
  description: "Guide for uploading offline conversions to SA360 via legacy v2 API",
  arguments: [
    {
      name: "agencyId",
      description: "SA360 Agency ID",
      required: true,
    },
    {
      name: "advertiserId",
      description: "SA360 Advertiser ID",
      required: true,
    },
  ],
};

export function getConversionUploadWorkflowMessage(args?: Record<string, string>): string {
  const agencyId = args?.agencyId || "{agencyId}";
  const advertiserId = args?.advertiserId || "{advertiserId}";
  return `# SA360 Conversion Upload Workflow

## Agency ID: ${agencyId} | Advertiser ID: ${advertiserId}

Upload offline conversions (CRM data, phone calls, in-store visits) to SA360 for attribution.

## Step 1: Validate Conversion Payload

Always validate before uploading:

\`\`\`json
{
  "tool": "sa360_validate_conversion",
  "params": {
    "mode": "insert",
    "conversion": {
      "clickId": "CLICK_ID_FROM_GCLID",
      "conversionId": "unique-conversion-id-001",
      "conversionTimestamp": "1709251200000",
      "segmentationType": "FLOODLIGHT",
      "segmentationName": "purchase",
      "type": "TRANSACTION",
      "revenueMicros": "50000000",
      "currencyCode": "USD"
    }
  }
}
\`\`\`

## Step 2: Insert Conversions

\`\`\`json
{
  "tool": "sa360_insert_conversions",
  "params": {
    "agencyId": "${agencyId}",
    "advertiserId": "${advertiserId}",
    "conversions": [
      {
        "clickId": "CLICK_ID_1",
        "conversionId": "conv-001",
        "conversionTimestamp": "1709251200000",
        "segmentationType": "FLOODLIGHT",
        "segmentationName": "purchase",
        "type": "TRANSACTION",
        "revenueMicros": "50000000",
        "currencyCode": "USD"
      },
      {
        "clickId": "CLICK_ID_2",
        "conversionId": "conv-002",
        "conversionTimestamp": "1709337600000",
        "segmentationType": "FLOODLIGHT",
        "segmentationName": "lead",
        "type": "ACTION"
      }
    ]
  }
}
\`\`\`

## Step 3: Update Existing Conversions (if needed)

\`\`\`json
{
  "tool": "sa360_update_conversions",
  "params": {
    "agencyId": "${agencyId}",
    "advertiserId": "${advertiserId}",
    "conversions": [
      {
        "clickId": "CLICK_ID_1",
        "conversionId": "conv-001",
        "conversionTimestamp": "1709251200000",
        "segmentationType": "FLOODLIGHT",
        "segmentationName": "purchase",
        "type": "TRANSACTION",
        "revenueMicros": "75000000",
        "currencyCode": "USD"
      }
    ]
  }
}
\`\`\`

## Conversion Types

| Type | Description |
|------|-------------|
| TRANSACTION | Purchase with revenue (requires revenueMicros) |
| ACTION | Non-revenue event (lead, signup, etc.) |

## ID Types

| Field | Description |
|-------|-------------|
| clickId | Google Click ID (gclid) -- most common |
| criterionId | Keyword criterion ID |

## Gotchas

| Issue | Solution |
|-------|----------|
| Timestamp format | Unix epoch in **milliseconds** (not seconds) |
| revenueMicros | In micros: $50 = "50000000" |
| conversionId must be unique | Use your CRM transaction ID |
| Upload within 90 days | Conversions older than 90 days may be rejected |
| Uses legacy v2 API | Different from Reporting API v0 (read tools) |
| segmentationName | Must match Floodlight activity name exactly |
`;
}

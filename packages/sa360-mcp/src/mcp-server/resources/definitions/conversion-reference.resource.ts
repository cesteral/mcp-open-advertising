// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Resource } from "../types.js";

export const conversionReferenceResource: Resource = {
  uri: "conversion-reference://all",
  name: "SA360 Conversion Upload Reference",
  description: "Conversion payload structure, validation rules, and v2 API format for SA360",
  mimeType: "text/markdown",
  getContent: () => `# SA360 Conversion Upload Reference

## API

Conversions use the **legacy DoubleClick Search v2 API**, separate from the Reporting v0 API.

## Insert Conversion Payload

\`\`\`json
{
  "clickId": "gclid_value",
  "conversionId": "unique-id-001",
  "conversionTimestamp": "1709251200000",
  "segmentationType": "FLOODLIGHT",
  "segmentationName": "purchase",
  "type": "TRANSACTION",
  "revenueMicros": "50000000",
  "currencyCode": "USD",
  "quantityMillis": "1000"
}
\`\`\`

## Required Fields

| Field | Type | Description |
|-------|------|-------------|
| clickId OR criterionId | string | Click identifier (gclid preferred) |
| conversionId | string | Unique conversion identifier |
| conversionTimestamp | string | Unix epoch in **milliseconds** |
| segmentationType | string | Always "FLOODLIGHT" |
| segmentationName | string | Floodlight activity name (exact match) |
| type | string | "TRANSACTION" or "ACTION" |

## Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| revenueMicros | string | Revenue in micros ($50 = "50000000") — required for TRANSACTION |
| currencyCode | string | ISO 4217 currency code |
| quantityMillis | string | Quantity in millis (1 item = "1000") |

## Conversion Types

| Type | Use Case | Revenue Required? |
|------|----------|:-:|
| TRANSACTION | Purchase, revenue event | ✓ |
| ACTION | Lead, signup, form submit | |

## Validation

Always validate before uploading:
\`\`\`json
{
  "tool": "sa360_validate_conversion",
  "params": {
    "mode": "insert",
    "conversion": { "...payload..." }
  }
}
\`\`\`

## Update vs Insert

- **Insert**: New conversions (sa360_insert_conversions)
- **Update**: Modify existing (sa360_update_conversions) — same clickId + conversionId + conversionTimestamp

## Gotchas

| Issue | Solution |
|-------|----------|
| Timestamp in milliseconds | Unix epoch × 1000 (not seconds) |
| revenueMicros is a string | "50000000" not 50000000 |
| segmentationName must match | Exact Floodlight activity name |
| 90-day upload window | Conversions older than 90 days rejected |
| Duplicate detection | Same conversionId = rejected (use unique IDs) |
`,
};
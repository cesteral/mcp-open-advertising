# Meta Ads MCP Server - Design Document

**Date:** 2026-02-25
**Status:** Implementation In Progress

## Overview

Fifth MCP server for Meta (Facebook/Instagram) Ads. Built from scratch against the Meta Marketing API v21.0 via direct HTTP. Bearer token auth via `Authorization: Bearer <access_token>`. Port 3005.

## Entity Hierarchy

```
Ad Account (act_XXXXX)
+-- Campaign         -> POST /act_{id}/campaigns
|   +-- Ad Set       -> POST /act_{id}/adsets (campaign_id in body)
|       +-- Ad       -> POST /act_{id}/ads (adset_id + creative in body)
+-- Ad Creative      -> POST /act_{id}/adcreatives (reusable)
+-- Custom Audience  -> POST /act_{id}/customaudiences (reusable)
```

## Tool Catalog (15 tools)

| Tool | Type | API Pattern |
|------|------|-------------|
| meta_list_entities | read | GET /act_{id}/{edge}?fields=...&filtering=[...] |
| meta_get_entity | read | GET /{entityId}?fields=... |
| meta_create_entity | write | POST /act_{id}/{edge} |
| meta_update_entity | write | POST /{entityId} |
| meta_delete_entity | write | DELETE /{entityId} |
| meta_list_ad_accounts | read | GET /me/adaccounts?fields=... |
| meta_get_insights | read | GET /{entityId}/insights?fields=...&date_preset=... |
| meta_get_insights_breakdowns | read | GET /{entityId}/insights?breakdowns=... |
| meta_bulk_update_status | write | Multiple POST /{id} |
| meta_bulk_create_entities | write | Multiple POST /act_{id}/{edge} |
| meta_search_targeting | read | GET /search?type={type}&q={query} |
| meta_get_targeting_options | read | GET /act_{id}/targetingbrowse |
| meta_duplicate_entity | write | POST /{entityId}/copies |
| meta_get_delivery_estimate | read | GET /act_{id}/delivery_estimate |
| meta_get_ad_previews | read | GET /{adId}/previews?ad_format=... |

## Auth Pattern

- Bearer token in `Authorization` header
- Token validation via `GET /me?fields=id,name`
- Stdio mode: `META_ACCESS_TOKEN` env var
- Fingerprint: hash first 16 chars of token

## API Specifics

- Base URL: `https://graph.facebook.com/v21.0`
- Errors: `{ error: { message, type, code, error_subcode, fbtrace_id } }`
- Rate limits: codes 4/17/32; headers: x-business-use-case-usage, x-app-usage
- Updates use POST (PATCH semantics), return `{ success: true }`
- Must explicitly request fields (Meta returns nothing by default)
- Account IDs prefixed with `act_`

## Resources (14)

entity-hierarchy, entity-schema (x5), entity-examples (x5), insights-reference, targeting-reference, findings

## Prompts (4)

campaign_setup_workflow, insights_reporting_workflow, troubleshoot_entity, tool_schema_exploration

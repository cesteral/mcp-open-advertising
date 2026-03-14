# Microsoft Advertising MCP Server Design

**Date**: 2026-03-14
**Package**: `@cesteral/msads-mcp`
**Port**: 3013

## Overview

MCP server for Microsoft Advertising (Bing Ads) campaign management and reporting via the Microsoft Advertising REST API v13 (bingads-13). Covers Search, Shopping, Audience, and Performance Max campaigns across Bing, Microsoft Audience Network, and partner properties.

## Why Microsoft Advertising

- ~$18-20B annual ad revenue, #3-4 globally in digital ads
- Largest uncovered search platform in the Cesteral stack
- Most Google Ads advertisers also run Microsoft Ads — completes Cesteral's search coverage
- Mature REST API (JSON-based, released 2024) with 75% latency improvement over legacy SOAP

## Authentication

**Auth mode**: `msads-bearer`

Required headers for every API call:
- `AuthenticationToken` — OAuth2 access token (Microsoft Identity Platform / Azure AD)
- `DeveloperToken` — per-app developer token from Microsoft Advertising
- `CustomerAccountId` — the ad account being operated on
- `CustomerId` — the customer (manager) ID

**Stdio mode env vars**: `MSADS_ACCESS_TOKEN`, `MSADS_DEVELOPER_TOKEN`, `MSADS_CUSTOMER_ID`, `MSADS_ACCOUNT_ID`

**HTTP mode**: Transport extracts Bearer token from `Authorization` header, developer token from `X-MSAds-Developer-Token`, customer/account IDs from `X-MSAds-Customer-Id` / `X-MSAds-Account-Id`.

**Auth strategy**: `MsAdsBearerAuthStrategy` in `packages/msads-mcp/src/auth/` — validates token via Customer Management API `GetUser` call, returns `platformAuthAdapter` with credentials.

## Entity Types

| Entity Type | CRUD | API Batch Limit | Notes |
|---|---|---|---|
| `campaign` | LCRUD | 100 | All campaign types (Search, Shopping, Audience, PMax) |
| `adGroup` | LCRUD | 1,000 | Nested under campaign |
| `ad` | LCRUD | 50 | Responsive Search Ads, etc. |
| `keyword` | LCRUD | 1,000 | Nested under adGroup |
| `budget` | LCRUD | 100 | Shared budget library |
| `adExtension` | LCRUD | 100 | Sitelinks, callouts, structured snippets |
| `audience` | LCRUD | 100 | Remarketing, custom, in-market |
| `label` | LCRUD | 100 | Cross-entity labeling |

## Tools (~20)

### Core CRUD (6)
| Tool | Description | Key Parameters |
|---|---|---|
| `msads_list_entities` | List entities with filters/paging | `entityType`, `accountId`, `parentId?`, `filters?` |
| `msads_get_entity` | Get single entity by type/ID | `entityType`, `entityId`, `accountId` |
| `msads_create_entity` | Create entity | `entityType`, `accountId`, `data` |
| `msads_update_entity` | Partial update entity | `entityType`, `entityId`, `accountId`, `data` |
| `msads_delete_entity` | Delete entity | `entityType`, `entityId`, `accountId` |
| `msads_list_accounts` | List accessible accounts | _(none)_ |

### Reporting (4)
| Tool | Description | Key Parameters |
|---|---|---|
| `msads_get_report` | Submit + poll + download (blocking) | `reportType`, `accountId`, `dateRange`, `columns` |
| `msads_submit_report` | Submit without waiting | `reportType`, `accountId`, `dateRange`, `columns` |
| `msads_check_report_status` | Poll report status | `reportRequestId` |
| `msads_download_report` | Download + parse CSV | `downloadUrl`, `maxRows?` |

### Bulk Operations (4)
| Tool | Description | Key Parameters |
|---|---|---|
| `msads_bulk_create_entities` | Batch create (up to 100) | `entityType`, `accountId`, `items[]` |
| `msads_bulk_update_entities` | Batch update (up to 100) | `entityType`, `accountId`, `items[]` |
| `msads_bulk_update_status` | Batch pause/enable/delete | `entityType`, `accountId`, `entityIds[]`, `status` |
| `msads_adjust_bids` | Batch adjust bids (read-modify-write) | `accountId`, `adjustments[]` |

### Targeting & Specialized (4)
| Tool | Description | Key Parameters |
|---|---|---|
| `msads_manage_ad_extensions` | Associate/disassociate extensions | `accountId`, `extensionIds[]`, `entityIds[]`, `action` |
| `msads_manage_criterions` | Manage targeting criterions | `entityType`, `entityId`, `accountId`, `criterions[]` |
| `msads_get_ad_preview` | Ad preview | `accountId`, `adId` |
| `msads_validate_entity` | Dry-run validate (no API call) | `entityType`, `mode`, `data` |

### Google Ads Import (1)
| Tool | Description | Key Parameters |
|---|---|---|
| `msads_import_from_google` | Trigger Google Ads import job | `accountId`, `googleAccountId?` |

## HTTP Client

**`MsAdsHttpClient`** — direct HTTP client (no SDK), pattern matches `TtdHttpClient`:

- REST base URLs:
  - Campaign Management: `https://campaign.api.bingads.microsoft.com/CampaignManagement/v13/`
  - Reporting: `https://reporting.api.bingads.microsoft.com/Reporting/v13/`
  - Customer Management: `https://clientcenter.api.bingads.microsoft.com/CustomerManagement/v13/`
  - Bulk: `https://bulk.api.bingads.microsoft.com/Bulk/v13/`
- Injects required headers on every request
- Handles partial success responses (Microsoft returns nil elements for failed items in batch)

## Rate Limiting

- `RateLimiter` from `@cesteral/shared`
- 60-second sliding window (Campaign Management + Ad Insight)
- Separate limits for Bulk and Reporting (internal, subject to change)

## Reporting Flow

Async pattern (same as TTD/TikTok):
1. `SubmitGenerateReport` → `ReportRequestId`
2. `PollGenerateReport` → status + `ReportDownloadUrl` when `Success`
3. Download CSV/TSV and parse into structured response

Report types: CampaignPerformance, AdGroupPerformance, AdPerformance, KeywordPerformance, SearchQuery, AudiencePerformance, GeographicPerformance, and more.

## Session Services

Per-session pattern (same as all other servers):
- `MsAdsSessionServices` holds `MsAdsHttpClient` instance per session
- `createSessionServices()` on transport connect
- `resolveSessionServices(sdkContext)` in tool handlers
- `sessionServiceStore.delete(sessionId)` on close/timeout

## Testing

- Zod schema validation tests
- Entity mapping tests
- Auth strategy tests
- Tool handler tests with mocked `MsAdsHttpClient`
- Schema size validation (< 100KB for stdio)

## References

- [Microsoft Advertising API docs](https://learn.microsoft.com/en-us/advertising/)
- [Campaign Management API](https://learn.microsoft.com/en-us/advertising/campaign-management-service/campaign-management-service-reference?view=bingads-13)
- [REST API announcement](https://techcommunity.microsoft.com/blog/adsapiblog/new-rest-api-and-bing-ads-sdk-may-2024-release-v13-0-20/4126605)
- [Authentication with OAuth](https://learn.microsoft.com/en-us/advertising/guides/authentication-oauth?view=bingads-13)
- [Reporting API](https://learn.microsoft.com/en-us/advertising/reporting-service/reporting-service-reference?view=bingads-13)

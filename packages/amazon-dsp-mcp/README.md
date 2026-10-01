# @cesteral/amazon-dsp-mcp

Amazon DSP MCP server for campaign management and reporting through the Amazon Ads API.

## Current Scope

Entity management runs on the Amazon Ads **Unified API** (`POST /adsApi/v1/{create,update,query,delete}/{resource}`, #234), per Amazon's machine-readable Unified DSP spec and DSP migration guide ([amzn/ads-advanced-tools-docs](https://github.com/amzn/ads-advanced-tools-docs) @ `e25aace0`, `unified-campaign-management-migration-skills/api-specs/unified-api-dsp.json` and `skills/unified-dsp-cm-migration`). **None of it has been exercised against Amazon yet.**

The entity tools keep the pre-Unified entity-type names (`entityType` accepts exactly these values — `campaign` / `adGroup` are **not** accepted); each maps onto one Unified resource:

| `entityType`          | Unified resource | ID field          | get | create | update | remove                                     |
| --------------------- | ---------------- | ----------------- | --- | ------ | ------ | ------------------------------------------ |
| `order`               | `campaigns`      | `campaignId`      | ✅  | ✅     | ✅     | LEGACY archive (`PUT /dsp/orders/{id}`)    |
| `lineItem`            | `adGroups`       | `adGroupId`       | ✅  | ✅     | ✅     | LEGACY archive (`PUT /dsp/lineItems/{id}`) |
| `creative`            | `ads`            | `adId`            | ✅  | ✅     | ✅     | — (no Unified delete)                      |
| `target`              | `targets`        | `targetId`        | —   | ✅     | —      | ✅ `delete/targets`                        |
| `creativeAssociation` | `adAssociations` | `adAssociationId` | ✅  | ✅     | ✅     | ✅ `delete/adAssociations`                 |

- Every entity tool takes `accountId` — the DSP advertiser ID (`advertiserId` from `amazon_dsp_list_advertisers`), sent as the `Amazon-Ads-AccountId` header. The advertiser is no longer a body field.
- Payloads use Unified field names (`flights[]`, `budgets[]`, `optimizations`, `bid.baseBid`, `targetDetails`, `adType` + `creative`, …). `adProduct: "AMAZON_DSP"` is added for you. A few legacy names are mapped mechanically: `orderId` → `campaignId`, `lineItemId` → `adGroupId`, `creativeId` → `adId`, `country` → `countries[]`, a DAILY/LIFETIME `budget` → `budgets[]`; other legacy fields (`bidding`, order `startDateTime`, `creativeType`, `expression`, …) are refused with the Unified field to use.
- Orders and line items can only be **created PAUSED** (the only create state Amazon accepts for DSP campaigns and ad groups); enable them with `amazon_dsp_bulk_update_status`.
- `state` on update is `ENABLED` or `PAUSED` only — the Unified API has no ARCHIVED update state. Orders and line items are removed through the one legacy call this server still makes (`PUT /dsp/orders|lineItems/{id} { state: "ARCHIVED" }`, never verified live); creatives (ads) cannot be removed.
- Targets have no Unified read-by-ID and no update: list them with `filters.adGroupId`, delete and recreate to change them.
- Lists paginate with `nextToken`.
- `amazon_dsp_list_advertisers` (`GET /dsp/advertisers`) and `amazon_dsp_get_ad_preview` (`GET /dsp/creatives/{id}/preview`) stay on legacy endpoints: the Unified DSP spec has no equivalent.

Commitments, commitment spend and campaign forecasts use the same Unified API family (`/adsApi/v1/*`).

## Reporting

DSP reporting uses DSP reports v3, scoped by the DSP advertiser ID in the URL path (per Amazon's Postman collection, Reporting / DSP report):

- Submit: `POST /accounts/{accountId}/dsp/reports` with `Accept: application/vnd.dspcreatereports.v3+json`
- Poll: `GET /accounts/{accountId}/dsp/reports/{reportId}` with `Accept: application/vnd.dspgetreports.v3+json`
- Body: `{ startDate: "YYYY-MM-DD", endDate: "YYYY-MM-DD", type, dimensions: [...], metrics: [...] }`
- Status values: `IN_PROGRESS`, `SUCCESS`, `FAILURE`; on `SUCCESS` the status response carries a presigned S3 `location`

`accountId` is the DSP advertiser ID (the `advertiserId` returned by `amazon_dsp_list_advertisers`), not the profile ID. The reporting tools (`amazon_dsp_submit_report`, `amazon_dsp_check_report_status`, `amazon_dsp_get_report`, `amazon_dsp_get_report_breakdowns`) all take it as an input.

Downloaded reports are handled as raw JSON, with CSV-style fallback parsing for defensive compatibility.

The `amazon_dsp_get_report`, `amazon_dsp_get_report_breakdowns`, and `amazon_dsp_download_report` tools all return data using the shared bounded report-view contract: `mode` (`"summary"` default — headers + counts + 10-row preview, or `"rows"` for a paginated rows page), `columns` (project to selected columns), `offset` (zero-based pagination), and `maxRows` (page size; default 10 for summary, 50 for rows; hard cap 200).

## Auth And Headers

All upstream requests carry `Authorization: Bearer <access token>`. The rest depends on the API family:

- **Unified API** (`/adsApi/v1/*` — entities, commitments, forecasts): `Amazon-Ads-ClientId` (spec `ClientIdHeader`) and, on every entity operation and the forecast, `Amazon-Ads-AccountId: <DSP advertiser id>` (spec `AccountIdHeader`). No `Amazon-Advertising-API-Scope`: the spec declares none and the DSP migration guide lists it as "Not used" (Amazon's generic Unified Postman collection does still send it).
- **Legacy** (`/dsp/*`, `/assets/*`, DSP reporting): `Amazon-Advertising-API-Scope: <profile id>` and `Amazon-Advertising-API-ClientId`.

The MCP server does not inject profile IDs into request bodies — scope is conveyed through Amazon's required headers.

### Auth flows

Amazon access tokens expire after **60 minutes** (hard limit, per [Amazon Ads API docs](https://advertising.amazon.com/API/docs/en-us/guides/get-started/retrieve-access-token)). Refresh-token lifetime depends on when consent was granted (per [Amazon's refresh-token guide](https://advertising.amazon.com/API/docs/en-us/guides/account-management/authorization/refresh-tokens)):

- **Consent granted before 2026-07-30**: the refresh token does not expire unless revoked.
- **Consent granted on/after 2026-07-30** (scopes `advertising::campaign_management`, `advertising::audiences`): the refresh token expires **365 days** after issuance. The advertiser must re-authorize the app annually; refresh calls with an expired token fail with `invalid_grant`, which this server surfaces as `Unauthorized` (HTTP 401 in HTTP mode) with a re-authorization hint.
- Additionally, an app that makes no successful API call for **2 years** has its access revoked.

The server supports two flows:

**Flow A — LwA refresh-token (recommended).** Provide `AMAZON_DSP_APP_ID` + `AMAZON_DSP_APP_SECRET` + `AMAZON_DSP_REFRESH_TOKEN` + `AMAZON_DSP_PROFILE_ID`. The adapter mints access tokens via `POST https://api.amazon.com/auth/o2/token` and auto-refreshes them before the 60-minute expiry. In HTTP mode, pass these as `X-AmazonDsp-App-Id` / `-App-Secret` / `-Refresh-Token` headers plus `Amazon-Advertising-API-Scope`.

**Flow B — static access token (CI / short sessions).** Provide `AMAZON_DSP_ACCESS_TOKEN` + `AMAZON_DSP_PROFILE_ID` + `AMAZON_DSP_CLIENT_ID` (the LwA client ID — without it no client-ID header is sent and Amazon rejects the calls). Server starts returning 401 after 60 minutes — re-mint manually. In HTTP mode, use a standard `Authorization: Bearer …` header.

Stdio prefers Flow A when its three env vars are set, falling back to Flow B.

### Producing a refresh token

The fastest path is Amazon's [Postman collection](https://github.com/amzn/ads-advanced-tools-docs) — its auth scripts walk through the OAuth grant flow, exchange the auth code, and store the resulting refresh token in environment variables. Alternatively follow steps 1–2 of the [official getting-started guide](https://advertising.amazon.com/API/docs/en-us/guides/get-started/overview) with `curl`.

### Tracking the 365-day refresh-token lifetime

For the env-configured token (Flow A), set `AMAZON_DSP_REFRESH_TOKEN_ISSUED_AT` to the ISO date the token was issued (i.e. when the advertiser granted consent). The server then:

- logs a warning at startup once the token is older than `AMAZON_DSP_REFRESH_TOKEN_WARN_AGE_DAYS` (default **335**, a 30-day runway), and an error once past 365 days;
- exposes `refreshTokenAgeDays` / `refreshTokenDaysUntilExpiry` / `refreshTokenStatus` (`ok` | `reauthorization-needed-soon` | `expired`) on `/health`, so alerting can page before expiry.

Tracking is opt-in and only covers the env token — in HTTP mode each session supplies its own refresh token via headers, and its age is the caller's to track. When a refresh does fail with `invalid_grant`, re-run the authorization grant (see "Producing a refresh token" above), update `AMAZON_DSP_REFRESH_TOKEN` (and `_ISSUED_AT`) in your secret store, and restart the server.

## Notes

- An `order` is a Unified DSP campaign; a `lineItem` is a Unified DSP ad group; a `creative` is a Unified DSP ad.
- Writes answer a 207 multi-status; an `error[]` entry is surfaced as a tool error with Amazon's `code` and `fieldLocation`.
- Bulk tools send one Unified request per item (the Unified batch limits are 5 campaigns / 20 ad groups / 10 ads / 1000 targets / 20 ad associations per request; native batching is not used yet).
- Guidance, Quick Actions, and the Unified-only DSP APIs (geo locations, location indexes, deals) are not implemented in this package.

# @cesteral/amazon-dsp-mcp

Amazon DSP MCP server for campaign management and reporting through the Amazon Ads API.

## Current Scope

The server currently exposes generic CRUD-style MCP tools for these Amazon DSP entities, addressed by Amazon's legacy object names (`entityType` accepts exactly these values — `campaign` / `adGroup` are **not** accepted):

- `order` — the campaign-level object
- `lineItem` — the ad-group-level object
- `creative` (read-only here: create is rejected, because Amazon routes creative writes to subtype-specific endpoints this server does not implement)
- `target`
- `creativeAssociation`

Entity management uses the legacy `/dsp/orders`, `/dsp/lineItems`, `/dsp/creatives`, `/dsp/targets` and `/dsp/creativeAssociations` endpoints. Amazon's DSP migration guide ([amzn/ads-advanced-tools-docs](https://github.com/amzn/ads-advanced-tools-docs), `unified-dsp-cm-migration`) directs integrations to the Unified `/adsApi/v1/{create,update,query,delete}/*` API; that migration is not done yet.

Commitments, commitment spend and campaign forecasts use the Amazon Ads API v1 (`/adsApi/v1/*`).

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

All upstream requests carry:

- `Authorization: Bearer <access token>`
- `Amazon-Advertising-API-Scope: <profile id>`
- the client ID, under the header name each API family requires:
  - `Amazon-Advertising-API-ClientId` on the legacy `/dsp/*` endpoints and DSP reporting
  - `Amazon-Ads-ClientId` on Ads API v1 (`/adsApi/v1/*`), per Amazon's spec (`unified-api-dsp.json` `ClientIdHeader`)

`amazon_dsp_get_campaign_forecast` additionally sends `Amazon-Ads-AccountId: <DSP advertiser id>`, which the spec requires on `retrieve/campaignForecasts/dsp`.

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

- Amazon DSP campaign management is modeled through the order object.
- Amazon DSP ad group management is modeled through the line item object.
- Performance+ support is represented through optional order fields such as `automatedAdGroupCreation`.
- Guidance, Quick Actions, and some newer DSP APIs are not yet implemented in this package.

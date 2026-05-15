# @cesteral/amazon-dsp-mcp

Amazon DSP MCP server for campaign management and reporting through the Amazon Ads API.

## Current Scope

The server currently exposes generic CRUD-style MCP tools for these Amazon DSP entities:

- `campaign` and `order` as backward-compatible aliases for the same management object
- `adGroup` and `lineItem` as backward-compatible aliases for the same management object
- `creative`
- `target`
- `creativeAssociation`

The implementation keeps the older `order` / `lineItem` names for compatibility while accepting Amazon-style `campaign` / `adGroup` inputs.

## Reporting

Amazon Ads reporting uses reporting v3:

- Submit: `POST /reporting/reports`
- Poll: `GET /reporting/reports/{reportId}`
- Required `Content-Type`: `application/vnd.createasyncreportrequest.v3+json`
- Status values: `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`

Downloaded reports are handled as raw JSON after decompression, with CSV-style fallback parsing for defensive compatibility.

The `amazon_dsp_get_report`, `amazon_dsp_get_report_breakdowns`, and `amazon_dsp_download_report` tools all return data using the shared bounded report-view contract: `mode` (`"summary"` default — headers + counts + 10-row preview, or `"rows"` for a paginated rows page), `columns` (project to selected columns), `offset` (zero-based pagination), and `maxRows` (page size; default 10 for summary, 50 for rows; hard cap 200).

## Auth And Headers

All upstream requests carry:

- `Authorization: Bearer <access token>`
- `Amazon-Advertising-API-Scope: <profile id>`
- `Amazon-Advertising-API-ClientId: <client id>`

The MCP server does not inject profile IDs into request bodies — scope is conveyed through Amazon's required headers.

### Auth flows

Amazon access tokens expire after **60 minutes** (hard limit, per [Amazon Ads API docs](https://advertising.amazon.com/API/docs/en-us/guides/get-started/retrieve-access-token)). Refresh tokens **do not expire** unless revoked. The server supports two flows:

**Flow A — LwA refresh-token (recommended).** Provide `AMAZON_DSP_APP_ID` + `AMAZON_DSP_APP_SECRET` + `AMAZON_DSP_REFRESH_TOKEN` + `AMAZON_DSP_PROFILE_ID`. The adapter mints access tokens via `POST https://api.amazon.com/auth/o2/token` and auto-refreshes them before the 60-minute expiry. In HTTP mode, pass these as `X-AmazonDsp-App-Id` / `-App-Secret` / `-Refresh-Token` headers plus `Amazon-Advertising-API-Scope`.

**Flow B — static access token (CI / short sessions).** Provide `AMAZON_DSP_ACCESS_TOKEN` + `AMAZON_DSP_PROFILE_ID` (+ optional `AMAZON_DSP_CLIENT_ID`). Server starts returning 401 after 60 minutes — re-mint manually. In HTTP mode, use a standard `Authorization: Bearer …` header.

Stdio prefers Flow A when its three env vars are set, falling back to Flow B.

### Producing a refresh token

The fastest path is Amazon's [Postman collection](https://github.com/amzn/ads-advanced-tools-docs) — its auth scripts walk through the OAuth grant flow, exchange the auth code, and store the resulting refresh token in environment variables. Alternatively follow steps 1–2 of the [official getting-started guide](https://advertising.amazon.com/API/docs/en-us/guides/get-started/overview) with `curl`.

## Notes

- Amazon DSP campaign management is modeled through the order object.
- Amazon DSP ad group management is modeled through the line item object.
- Performance+ support is represented through optional order fields such as `automatedAdGroupCreation`.
- Guidance, Quick Actions, and some newer DSP APIs are not yet implemented in this package.

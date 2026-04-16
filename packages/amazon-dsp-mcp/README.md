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

All requests use:

- `Authorization: Bearer <access token>`
- `Amazon-Advertising-API-Scope: <profile id>`
- `Amazon-Advertising-API-ClientId: <client id>` when available

The MCP server does not inject profile IDs into request bodies. Scope is conveyed through Amazon’s required headers.

## Notes

- Amazon DSP campaign management is modeled through the order object.
- Amazon DSP ad group management is modeled through the line item object.
- Performance+ support is represented through optional order fields such as `automatedAdGroupCreation`.
- Guidance, Quick Actions, and some newer DSP APIs are not yet implemented in this package.

# Changelog

All notable changes to this project will be documented in this file.

This project uses [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).

## [Unreleased]

### Added

- **ttd-mcp** — Expanded from 21 to 55 tools. Adds the Workflows API (13 tools for campaign/ad group create/update + async jobs), a full GraphQL reporting suite (15 tools covering immediate entity reports, schedules, templates, executions), bid list management (`ttd_manage_bid_list`, `ttd_bulk_manage_bid_lists`), and audience seed management (`ttd_manage_seed`). Report type discovery tools (`ttd_list_report_types`, `ttd_get_report_type_schema`, `ttd_get_entity_report_types`) added.
- **dv360-mcp** — Advertiser- and campaign-level targeting support; grew from 23 to 25 tools.
- **cm360-mcp** — Report scheduling support (`create/list/delete_report_schedule`); grew from 16 to 20 tools.
- **msads-mcp** — Ad extension management, report scheduling, and cross-platform `msads_import_from_google`; grew from 20 to 24 tools.
- **pinterest-mcp** — Added 22nd tool rounding out reporting coverage.
- **gads-mcp** — Added 15th tool; GAQL queries now pass `omit_unselected_resource_names=true`.
- Reporting gap closure across 11 servers (single pass to align breakdowns, dimensions, metrics).

### Changed

- **meta-mcp** — Upgraded to Meta Marketing API **v24.0** (from v22.0); expanded from 20 to 25 tools with insights breakdowns, delivery estimate, budget schedules.
- **amazon-dsp-mcp** — Schemas rebaselined against Amazon Reporting v3 OpenAPI spec.
- **amazon-dsp-mcp** — Reporting endpoints corrected to the DSP-specific async reporting API: `POST /accounts/{accountId}/dsp/reports` with `Accept: application/vnd.dspcreatereports.v3+json` (previously hit the unified Sponsored Ads reporting path). Reporting tools now take `accountId` (DSP entity ID) instead of the unused `profileId` input.
- **snapchat-mcp** — Aligned with latest Snapchat Ads API endpoints.
- **msads-mcp** — Migrated to Microsoft Advertising JSON API.
- **dbm-mcp** — Report polling budget increased to handle large date ranges.
- Shared: service method signatures now use typed entity interfaces end-to-end.

### Fixed

- Pre-deploy drift and config alignment across fleet (registry tool counts, `server.json` hostnames, `amazon-dsp` port).

### Removed

- **amazon-dsp-mcp** — Removed `amazon_dsp_search_targeting` tool; the `/dsp/audienceSegments` endpoint it targeted is not present in Amazon's public DSP API (verified against Amazon's Postman collection and the reference `python-amazon-ad-api` SDK). Tool count dropped from 19 to 18.
- Corrected three broken computed-metric and pacing calculations.
- Numerous ttd-mcp runtime fixes found via live tool testing (entity-type counts, output schemas, ad preview extraction, GraphQL type alignment, report execution endpoint paths, partner-ID threading on advertiser writes).

### Docs

- `CLAUDE.md` now the single source of truth for agent guidance; `AGENTS.md` reduced to a pointer.
- `ttd-mcp` README gained a GraphQL API reference section.
- Root README fleet table updated with accurate tool counts.

## [1.0.0] - 2026-03-21

### Summary

Initial public release of Cesteral MCP Servers — thirteen independent MCP servers covering all major advertising platforms.

### Servers

- **gads-mcp** — Google Ads REST API v23 (14 tools)
- **meta-mcp** — Meta Marketing API v22.0 (20 tools)
- **dv360-mcp** — DV360 API v4 (23 tools)
- **ttd-mcp** — The Trade Desk REST API (21 tools)
- **linkedin-mcp** — LinkedIn Marketing API v2 (20 tools)
- **tiktok-mcp** — TikTok Marketing API v1.3 (23 tools)
- **cm360-mcp** — CM360 API v5 (16 tools)
- **sa360-mcp** — SA360 Reporting API v0 + v2 (15 tools)
- **pinterest-mcp** — Pinterest Ads API v5 (21 tools)
- **snapchat-mcp** — Snapchat Ads API v1 (23 tools)
- **amazon-dsp-mcp** — Amazon DSP API (18 tools)
- **msads-mcp** — Microsoft Advertising API v13 (20 tools)
- **dbm-mcp** — Bid Manager API v2 (6 tools)

### Shared

- `@cesteral/shared` — Auth strategies, OpenTelemetry, rate limiting, tool registration factory, structured logging

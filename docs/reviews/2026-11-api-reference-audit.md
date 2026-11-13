# 2026-11 API reference audit

Audit date: 2026-11-13. Question: are the API versions and platform facts pinned in each server out of date?

Method: every pin in `platform-facts.json` and each `src/config/index.ts` was compared with the vendor's own page, fetched on the audit date. Where a vendor page is rendered client-side and could not be read, the row says so. No code was changed and no live call was made. Nothing here moves a ledger entry to `verified`; that needs a deliberate `verifiedAt` edit per [platform-facts-ledger.md](../architecture/platform-facts-ledger.md).

## Summary

**No pinned version is dead.** Every pin that could be checked is still supported. Several are one release behind, and several have dated changes coming (findings 1–5).

| Server         | Pin in code    | Vendor state on 2026-11-13                                                      | Verdict                     |
| -------------- | -------------- | ------------------------------------------------------------------------------- | --------------------------- |
| gads-mcp       | v25            | v25 sunsets Aug 2027; **v26 is latest** (14 Oct), v26.2 out 11 Nov              | Supported, one behind       |
| dv360-mcp      | v4             | v4 has no sunset date; **v5 is in public beta** (22 Oct)                        | Supported; do not move yet  |
| dbm-mcp        | v2             | Release notes list v2 as latest, no v3 release                                  | Current                     |
| cm360-mcp      | v5             | v4 sunset 26 Feb 2026; v5 has no announced sunset                               | Current                     |
| sa360-mcp      | v0 + legacy v2 | Reporting v0 notes run to 10 Mar 2026, no newer major                           | Current (v2 not re-checked) |
| meta-mcp       | v26.0          | **v27.0 is latest** (4 Nov); v26.0 and v27.0 have no expiry; v24 expired 10 Nov | Supported, one behind       |
| linkedin-mcp   | 202608         | 202608 Active, sunset 17 Aug 2027; **202610 is latest**                         | Supported, two behind       |
| msads-mcp      | v13            | Release notes cover only v13, no sunset announced; SDK 13.0.30 on 29 Sep 2026   | Current                     |
| snapchat-mcp   | unversioned    | No version to check; one enum change dated 15 Feb 2027                          | Action needed (see below)   |
| pinterest-mcp  | v5             | Still v5; several 2025–26 endpoint deprecations                                 | Not fully checked           |
| ttd-mcp        | v3             | REST `/v3` still current (read in browser); deprecations dated to Feb 2027      | Supported; items below      |
| tiktok-mcp     | v1.3           | v1.3 still current; legacy create endpoints restricted from 1 Jan 2027          | **Action needed (below)**   |
| amazon-dsp-mcp | unversioned    | `/dsp/advertisers` returns 404 from July 2027; refresh-token policy confirmed   | **Action needed (below)**   |

## Findings that need action

Findings 1 and 2 were fixed in the same change as this report (see each).

### 1. meta-mcp: the lookalike example uses a field v27.0 rejects

**Fixed:** the example no longer sends `country`, and says to set `targeting.geo_locations` on the ad set instead, as Meta's lookalike guide directs. The example's `origin` array was left as it was; the guide now describes a top-level `origin_audience_id` for custom-audience seeds, which the pinned v26 spec does not list, so that is unchecked.

[`entity-examples.resource.ts:132`](../../packages/meta-mcp/src/mcp-server/resources/definitions/entity-examples.resource.ts) shows a lookalike audience with `"lookalike_spec": { "country": "US", ... }`. Meta's v27.0 changelog says `lookalike_spec.country` and `lookalike_spec.location_spec` are rejected on `POST /act_{id}/customaudiences` from v27.0, and on other versions once a 90-day window closes (about 90 days after 4 Nov 2026, exact date "TBC" on Meta's page). The pin is v26.0, so the example works today. It will start failing for every caller when the window closes, and it is what an agent copies.

Source: https://developers.facebook.com/documentation/ads-commerce/marketing-api/marketing-api-changelog/version27.0

### 2. snapchat-mcp: two `snapchat_positions` values are being merged on 15 Feb 2027

**Fixed:** `INTERSTITIAL_SPOTLIGHT` is removed from the enum and the ad-squad prompt, which now explains the merge. Snap's Ad Squads page names the surviving value: `INTERSTITIAL_CONTENT`. From 15 Feb 2027 new ad squads sending `INTERSTITIAL_SPOTLIGHT` are mapped to it with a deprecation warning, and an existing ad squad that uses only one of the two stops delivering until updated.

Snap's November 2026 announcement says `INTERSTITIAL_CONTENT` and `INTERSTITIAL_SPOTLIGHT` will be consolidated into a single value from 15 Feb 2027. Both appeared in the `snapchat_positions` enum in [`entity-schemas.resource.ts:114`](../../packages/snapchat-mcp/src/mcp-server/resources/definitions/entity-schemas.resource.ts) and in the ad-squad prompt in `campaign-setup-workflow.prompt.ts:85`. Resolve the replacement name from Snap's Ad Squads `placement_v2` page before that date.

Source: https://developers.snap.com/marketing-api/Ads-API/announcements

### 3. meta-mcp: v27.0 default changes affect create calls, no code reference found

- Ad sets in eligible Sales campaigns created without `targeting.targeting_automation.individual_setting.device` get "reach more people across other mobile devices" switched on (`device: 1`). Applies to all versions about 90 days after 4 Nov (TBC). Set `device: 0` to opt out.
- Creatives without `product_extensions` settings may get Product showcase switched on. Opt out with `degrees_of_freedom_spec.creative_features_spec.product_extensions.enroll_status: "OPT_OUT"`.
- `POST /{catalog-id}/batch` is deprecated (use the Catalog Items Batch API) and `meta_moment_maker_spec` is dropped for third-party apps.

`grep` found no reference to any of these field names in `packages/meta-mcp/src`, so no code breaks. The two defaults can change what meta-mcp's ad-set and creative writes do. Consider whether `meta_create_entity` should warn about them, as it already does for the three v26 changes tracked in `meta.v26_changes_apply_to_all_versions`.

### 4. tiktok-mcp: legacy create endpoints stop serving three objectives on 1 Jan 2027

TikTok's docs banner and What's New page say that from 1 Jan 2027 `/campaign/create/`, `/campaign/copy/task/create/`, `/adgroup/create/`, `/ad/create/` and `/ad/aco/create/` no longer create or copy non-Search "Legacy Manual Flow" campaigns, or create ad groups or ads under them, for the Sales, App Promotion and Lead Generation objectives. The replacement is the Upgraded Smart+ API (`/smart_plus/campaign|adgroup|ad/...`), which TikTok has been extending through November 2026.

[`entity-mapping.ts`](../../packages/tiktok-mcp/src/mcp-server/tools/utils/entity-mapping.ts) builds only the legacy `campaign|adgroup|ad/create/` paths, and `grep` finds no `/smart_plus/` call in `packages/tiktok-mcp/src`. The shipped bulk-create example uses `objective_type: "APP_INSTALLS"`. After 1 Jan 2027 `tiktok_create_entity` and the bulk tool will be refused for those objectives. Traffic-style objectives are not named in the notice. This is a feature gap, not a one-line fix: it needs new Upgraded Smart+ create tools or a routing change.

Source: https://business-api.tiktok.com/portal/docs/whats-new/v1.3

### 5. amazon-dsp-mcp: `GET /dsp/advertisers` is deprecated and returns 404 from July 2027

Amazon's 20 Jul 2026 release note deprecates `/dsp/advertisers` and `/dsp/advertisers/{advertiserId}` (and the `/adsAccounts` endpoints) in favour of `POST /adsApi/v1/query/advertiserAccounts` and `POST /adsApi/v1/create/advertiserAccounts`. Since July 2026 they return `Warning: 299` deprecation headers and new client integrations are blocked; from July 2027 they return 404.

[`amazon-dsp-auth-adapter.ts:59`](../../packages/amazon-dsp-mcp/src/auth/amazon-dsp-auth-adapter.ts) validates every session by calling `GET /dsp/advertisers`, and `amazon_dsp_list_advertisers` and every tool's `accountId` guidance depend on its results. At the 404, all sessions fail at the auth step. Moving to `query/advertiserAccounts` also means re-checking what ID the unified `Amazon-Ads-AccountId` header takes, which `amazon_dsp.unified_entity_api` already lists as unverified.

Also from the same page: from 18 Nov 2026, unified campaign-management queries made with a global account ID (`amzn1.ads-account.g.*`) and without `marketplaceScopeFilter: GLOBAL` must filter by ID or return 400. The server sends a numeric DSP advertiser ID, so it is not affected unless a caller passes a global ID.

Source: https://advertising.amazon.com/API/docs/en-us/release-notes/index

## Findings that are version drift only (no breakage today)

| Server       | Detail                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| gads-mcp     | v26 breaking changes are Local Services Performance Max (`country_code`, `listing_id` now required), `enhanced_conversions_for_leads_enabled` removed from `ConversionTrackingSetting`, and hotel bid-modifier renames (`min_nights` to `min_days`, `HotelDateSelectionType` to `DateSelectionType`). None of these names appears in `packages/gads-mcp/src`, so a bump to v26 looks low-risk, but the notes were only read to the first 100,000 characters.                                                                                                                                                                                                                                                                                   |
| dv360-mcp    | v5 removes `firstPartyAndPartnerAudiences` create/patch/`editCustomerMatchMembers`, all `inventorySources` mutating and read methods, `TARGETING_TYPE_INVENTORY_SOURCE`, and `audienceExpansionLevel`. The generated schemas still contain several of these. Staying on v4 is correct while v5 is beta. v4 itself changed on 22 Oct (`InsertionOrderType.OUT_OF_HOME`, `YoutubeAndPartnersSettings.relatedVideos` replacing `relatedVideoIds`), which needs a schema regeneration, not a pin change.                                                                                                                                                                                                                                           |
| linkedin-mcp | 202608 is Active until 17 Aug 2027. 202610 is the newest. The migrations page also warns 202511 sunsets 16 Nov 2026, which does not affect this pin.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| meta-mcp     | v26.0 is still available (no expiry date set). Bump to v27.0 only together with finding 1 and a regeneration of `tests/fixtures/graph-v26-spec.json`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ttd-mcp      | REST stays at `/v3`. Deprecated names still in use: the GraphQL query `myReportsReportTemplates` (renamed `reportingTemplates` on 22 May 2026; "old names still work for now") in `list-report-templates.tool.ts` and `create-report-template.tool.ts`, and `isDerived` (now `partialAccess`) in the GraphQL reference resource. Dated removals ahead: brand-safety and contextual-category properties from REST `/v3/adgroup`, `/v3/bidlist`, `/v3/bidlist/batch`, `/v3/campaign` on 8 Feb 2027; `POST /v3/universalforecasting/generate` on 28 Feb 2027 (no reference in `src`); new campaigns cannot create contextual bid lists from 11 Jan 2027. `manage-bid-list.tool.ts` and the bulk bid-list tool were not checked against that list. |

## Read in a browser (second pass)

TTD, TikTok and Amazon Ads render their docs client-side, so a plain fetch returned only a title. They were read in the browser pane instead. TTD's docs have moved from `partner.thetradedesk.com` to `open.thetradedesk.com` (the old host redirects); the `sourceUrl` of `ttd.api_version` in `platform-facts.json` points at the old host. The new release-notes and upcoming-changes pages are public, without a login. TikTok shows a cookie banner; optional cookies were declined.

- Amazon: the release notes confirm `amazon_dsp.refresh_token_expires_at_365_days` (tokens issued on or after 30 Jul 2026 expire 365 days from advertiser consent; earlier tokens are grandfathered). They list no change to the legacy `PUT /dsp/orders|lineItems/{id}` archive call either way, so `amazon_dsp.unified_entity_gaps` stays unverified. A Catch-Up Boost field is deprecated on `POST/PATCH /dsp/v1/adGroups`.
- TTD: no `/v3` retirement. The third-party report of an API version retired on 3 Aug 2026 is not supported by TTD's own notes, which list `EnabledValueAddedProviders` as fully deprecated that day (replaced by `EnabledValueAddedProviderIds`).
- TikTok: v1.3 is the current version; the finding is the 1 Jan 2027 change in finding 4.

## Not verified

- Pinterest: not read through; the official changelog lists 2025–26 deprecations of the custom audience endpoint, `conversion_eqs`, several targeting-template and bid-floor endpoints, and user-interests analytics. `pinterest-service.ts` and `search-targeting.tool.ts` touch targeting, so check them against the changelog.
- SA360: `doubleclicksearch/v2` (conversions) was not checked.
- CM360 and SA360 rows rest on search-result summaries of Google's pages, not a direct fetch.

## Sources read on 2026-11-13

- Google Ads: https://developers.google.com/google-ads/api/docs/sunset-dates and https://developers.google.com/google-ads/api/docs/release-notes
- DV360: https://developers.google.com/display-video/api/release-notes
- Bid Manager: https://developers.google.com/bid-manager/release-notes
- CM360: https://developers.google.com/doubleclick-advertisers/rel_notes (search summary)
- SA360: https://developers.google.com/search-ads/reporting/api/reference/release-notes (search summary)
- Meta: https://developers.facebook.com/documentation/ads-commerce/marketing-api/marketing-api-changelog and its `version27.0` page
- LinkedIn: https://learn.microsoft.com/en-us/linkedin/marketing/integrations/migrations
- Microsoft Advertising: https://learn.microsoft.com/en-us/advertising/guides/release-notes
- Snapchat: https://developers.snap.com/marketing-api/Ads-API/announcements and https://developers.snap.com/marketing-api/Ads-API/ad-squads
- TikTok: https://business-api.tiktok.com/portal/docs/whats-new/v1.3 (browser)
- Amazon Ads: https://advertising.amazon.com/API/docs/en-us/release-notes/index (browser)
- TTD: https://open.thetradedesk.com/rest/openttd/advertiser/content/docs/AdvertiserNews/news/doc/ReleaseNotes and `.../UpgradeSupport` (found through TTD's `llms.txt`)

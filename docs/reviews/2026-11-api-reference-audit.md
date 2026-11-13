# 2026-11 API reference audit

Audit date: 2026-11-13. Question: are the API versions and platform facts pinned in each server out of date?

Method: every pin in `platform-facts.json` and each `src/config/index.ts` was compared with the vendor's own page, fetched on the audit date. Where a vendor page is rendered client-side and could not be read, the row says so. No code was changed and no live call was made. Nothing here moves a ledger entry to `verified`; that needs a deliberate `verifiedAt` edit per [platform-facts-ledger.md](../architecture/platform-facts-ledger.md).

## Summary

**No pinned version is dead.** Every pin that could be checked is still supported. Several are one release behind, and two have dated changes coming that touch shipped examples or enums.

| Server         | Pin in code    | Vendor state on 2026-11-13                                                           | Verdict                     |
| -------------- | -------------- | ------------------------------------------------------------------------------------ | --------------------------- |
| gads-mcp       | v25            | v25 sunsets Aug 2027; **v26 is latest** (14 Oct), v26.2 out 11 Nov                   | Supported, one behind       |
| dv360-mcp      | v4             | v4 has no sunset date; **v5 is in public beta** (22 Oct)                             | Supported; do not move yet  |
| dbm-mcp        | v2             | Release notes list v2 as latest, no v3 release                                       | Current                     |
| cm360-mcp      | v5             | v4 sunset 26 Feb 2026; v5 has no announced sunset                                    | Current                     |
| sa360-mcp      | v0 + legacy v2 | Reporting v0 notes run to 10 Mar 2026, no newer major                                | Current (v2 not re-checked) |
| meta-mcp       | v26.0          | **v27.0 is latest** (4 Nov); v26.0 and v27.0 have no expiry; v24 expired 10 Nov      | Supported, one behind       |
| linkedin-mcp   | 202608         | 202608 Active, sunset 17 Aug 2027; **202610 is latest**                              | Supported, two behind       |
| msads-mcp      | v13            | Release notes cover only v13, no sunset announced; SDK 13.0.30 on 29 Sep 2026        | Current                     |
| snapchat-mcp   | unversioned    | No version to check; one enum change dated 15 Feb 2027                               | Action needed (see below)   |
| pinterest-mcp  | v5             | Still v5; several 2025–26 endpoint deprecations                                      | Not fully checked           |
| ttd-mcp        | v3             | Not readable (client-rendered portal)                                                | Unverified                  |
| tiktok-mcp     | v1.3           | Not readable (client-rendered portal); no 1.3 deprecation found in secondary sources | Unverified                  |
| amazon-dsp-mcp | unversioned    | Not readable (client-rendered portal)                                                | Unverified                  |

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

## Findings that are version drift only (no breakage today)

| Server       | Detail                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| gads-mcp     | v26 breaking changes are Local Services Performance Max (`country_code`, `listing_id` now required), `enhanced_conversions_for_leads_enabled` removed from `ConversionTrackingSetting`, and hotel bid-modifier renames (`min_nights` to `min_days`, `HotelDateSelectionType` to `DateSelectionType`). None of these names appears in `packages/gads-mcp/src`, so a bump to v26 looks low-risk, but the notes were only read to the first 100,000 characters.                                         |
| dv360-mcp    | v5 removes `firstPartyAndPartnerAudiences` create/patch/`editCustomerMatchMembers`, all `inventorySources` mutating and read methods, `TARGETING_TYPE_INVENTORY_SOURCE`, and `audienceExpansionLevel`. The generated schemas still contain several of these. Staying on v4 is correct while v5 is beta. v4 itself changed on 22 Oct (`InsertionOrderType.OUT_OF_HOME`, `YoutubeAndPartnersSettings.relatedVideos` replacing `relatedVideoIds`), which needs a schema regeneration, not a pin change. |
| linkedin-mcp | 202608 is Active until 17 Aug 2027. 202610 is the newest. The migrations page also warns 202511 sunsets 16 Nov 2026, which does not affect this pin.                                                                                                                                                                                                                                                                                                                                                 |
| meta-mcp     | v26.0 is still available (no expiry date set). Bump to v27.0 only together with finding 1 and a regeneration of `tests/fixtures/graph-v26-spec.json`.                                                                                                                                                                                                                                                                                                                                                |

## Not verified (vendor page not readable)

TTD, TikTok and Amazon Ads document their APIs on client-rendered portals, and a plain fetch returned only the page title. Their rows in the summary are therefore carried over from the ledger, not re-confirmed. The ledger already records how to read them (a real browser; for TTD, `window.monaco.editor.getModels()`). Secondary sources, which are weaker evidence:

- TikTok: no v1.3 deprecation found; v1.3 still described as active.
- TTD: a third party reports a TTD API version being retired on 3 Aug 2026 without naming it; `api.thetradedesk.com/v3` is still the documented base. Worth a browser read of the partner-portal release notes.
- Amazon: a third party reports the legacy standalone DSP API was scheduled for deprecation on 30 Jun 2025 and "campaign / ad group" replacing "order / line item". amazon-dsp-mcp still calls legacy `PUT /dsp/orders|lineItems/{id}` for archive, which the ledger already marks unverified (`amazon_dsp.unified_entity_gaps`). This is the highest-risk unverified surface in the fleet.
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
- Snapchat: https://developers.snap.com/marketing-api/Ads-API/announcements

# tiktok-mcp

Platform notes for this package: quirks that are easy to forget when editing it. Repo-wide conventions are in the [root CLAUDE.md](../../CLAUDE.md).

`X-TikTok-Advertiser-Id` header in HTTP mode; image/video upload supported.

## Upgraded Smart+ (create path from 2027-01-01)

TikTok's What's New page (v1.3) says that from 2027-01-01 `/campaign/create/`, `/campaign/copy/task/create/`, `/adgroup/create/`, `/ad/create/` and `/ad/aco/create/` no longer create or copy non-Search Legacy Manual Flow campaigns, or ad groups and ads under them, for Sales (`WEB_CONVERSIONS`), App Promotion and Lead Generation. The replacement is `/smart_plus/`, exposed as `tiktok_{get,create,update}_smart_plus_entity` and `tiktok_update_smart_plus_status`. Traffic and the other objectives are not offered by the Smart+ API and stay on the legacy tools. Read the vendor pages in a rendered browser (the portal is client-side); the SDK pinned in the wire tests has `yml_files/smart_plus_*.yml`.

- **Different shapes, not a path swap.** Ad groups need `promotion_type`, `bid_type`, `billing_event`, `targeting_spec`; ads take `creative_list[].creative_info`, `ad_text_list` and `landing_page_url_list`. The ad id is `smart_plus_ad_id` (create response, update body) and `smart_plus_ad_ids` (status update), not `ad_id`.
- **`request_id`** is required by campaign and ad group create (not ad create) and is TikTok's idempotency key. The service generates one per call, so the HTTP client's retries reuse it; a caller-supplied one is kept.
- **Legacy get returns Smart+ entities, legacy create/update cannot touch them** (compatibility guide, doc id 1854112742370306). That is why the update, status and get tools exist as well as create. `tiktok_get_entity` finds a campaign or ad group but its ad filter is the legacy `ad_ids`, so use the Smart+ get for ads.
- **Smart+ status is `operation_status`** (`ENABLE` / `DISABLE` / `DELETE`; ads also `FROZEN`), not the legacy `CAMPAIGN_STATUS_*` `status`, and a campaign's default budget mode is `BUDGET_MODE_DYNAMIC_DAILY_BUDGET`; `smart-plus-snapshot.ts` normalizes both.
- **Account allowlist.** Campaign management needs the ad account allowlisted by TikTok; many fields are separately allowlist-only. Reads and reporting need none. Nothing here has been run against a live account.
- **No Smart+ duplicate.** `/smart_plus/campaign/copy/task/create|check/` exist but are not wrapped.

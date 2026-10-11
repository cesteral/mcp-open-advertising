# Platform keys and the cross-server contract: two decisions before the new-server template

**Date:** 2026-10-11
**Status:** Proposed. Six decisions are needed (listed at the end); nothing is implemented.
**Origin:** the new-server guidance work in [#272](https://github.com/cesteral/mcp-open-advertising/pull/272). The planned template package and `pnpm new:server` scaffold will copy whatever conventions exist when they are built, so these two should be settled first.

## Why now

A scaffold multiplies conventions. Today a contributor adding a platform has to choose a platform identifier for at least seven namespaces, with no rule to follow, and has to satisfy a "required tools" contract that three shipped servers do not meet. Whatever the template encodes becomes the precedent for every server after it.

---

## Decision 1: platform keys

### What exists

Each server spells its platform in up to seven places. The table shows the servers where at least one of them differs from the tool prefix; `ttd`, `tiktok`, `sa360`, `pinterest` and `snapchat` use their prefix everywhere.

| Namespace                                                       | dbm               | dv360              | gads         | meta       | linkedin       | cm360              | amazon_dsp   | msads       |
| --------------------------------------------------------------- | ----------------- | ------------------ | ------------ | ---------- | -------------- | ------------------ | ------------ | ----------- |
| Tool prefix                                                     | `dbm`             | `dv360`            | `gads`       | `meta`     | `linkedin`     | `cm360`            | `amazon_dsp` | `msads`     |
| `annotations.cesteral.platform`                                 | (ungoverned)      | `dv360`            | `google_ads` | `meta_ads` | `linkedin_ads` | `cm360`            | `amazon_dsp` | `msads`     |
| `contractPlatformSlug` (prefix of every `contractId`)           | (ungoverned)      | `dv360`            | `google_ads` | `meta`     | `linkedin_ads` | `cm360`            | `amazon_dsp` | `msads`     |
| Factory `platform` (span attr `mcp.platform`, interaction logs) | `dv360-reporting` | `dv360-management` | `gads`       | `meta`     | `linkedin`     | `cm360-management` | `amazon_dsp` | `msads`     |
| Span helper / rate-limiter key                                  | `bidmanager`      | `dv360`            | `gads`       | `meta`     | `linkedin`     | `cm360`            | `amazon_dsp` | `msads`     |
| `ReportingPlatform` / report-schedule `platform` enum (shared)  | `dbm`             | —                  | `google`     | `meta`     | `linkedin`     | `cm360`            | `amazonDsp`  | `microsoft` |
| `platform-facts.json` id prefix                                 | `dbm`             | `dv360`            | `google_ads` | `meta`     | `linkedin`     | `cm360`            | `amazon_dsp` | `msads`     |

Meta is the one server whose `cesteral.platform` (`meta_ads`) differs from its own `contractPlatformSlug` (`meta`). Within each server the annotations are consistent: `contract-id-invariant` already requires one slug per server.

The governance repo (`cesteral-intelligence`) adds its own dialects and reconciles them with alias tables:

| Governance namespace                                                              | Values                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AdPlatformSlug` via `PLATFORM_ALIASES` (`platform-compliance/aliases.ts`)        | `meta_ads`, `google_ads`, `dv360`, `dbm`, `ttd`, `linkedin_ads`, `tiktok`, `pinterest`, `snapchat`, `amazon_dsp`, `cm360`, `sa360`, `microsoft_ads`; already accepts `meta`, `gads`, `linkedin`, `msads`, `amazon-dsp` as aliases |
| `integration_provider` DB enum (credential providers)                             | `…_ads` long forms, including `tiktok_ads`, `pinterest_ads`, `snapchat_ads`, `microsoft_ads`                                                                                                                                      |
| `FIXTURE_COVERAGE_MAP`, `CanonicalPlatform`, `PLATFORM_LOOKUPS` (write admission) | keyed by `contractPlatformSlug`: `meta`, `dv360`, `google_ads`, `amazon_dsp`, `ttd`, `linkedin_ads`, `tiktok`, `cm360`, `snapchat`, `pinterest`, `msads`                                                                          |
| `GUARDRAIL_PLATFORM_ALIASES`                                                      | `{ meta_ads: "meta" }`, then tenant `platform_tags` match the published `platform`                                                                                                                                                |

### What each identifier costs to change

| Identifier                            | In `definitionHash`?                                                                                                        | Downstream consumers                                                                                                                                                                                     | Cost of a rename                                                                                                                                                               |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `contractPlatformSlug` / `contractId` | **Yes** (whole `annotations` block is hashed)                                                                               | Governance write admission (`FIXTURE_COVERAGE_MAP[slug]`), `CanonicalPlatform`, budget-field precedence, blessed-hash records, decision tokens                                                           | **Frozen in practice.** A unilateral rename makes admission return `noAdmittedCapabilities`: every governed write on that platform stops. Needs a lockstep governance release. |
| `cesteral.platform`                   | **Yes**                                                                                                                     | Confidence calibration (keyed by platform; history resets), tenant guardrail `platform_tags` and `context.platform` conditions (silently stop matching), entity-ref capture (throws on an unknown value) | Possible but not free: every governed hash on the server moves (tools go `drifted`, `live-verified` demotes, pending approvals are rejected), plus a guardrail-tag audit.      |
| Factory `platform` (telemetry)        | No                                                                                                                          | `mcp.platform` span attribute, `platform` field in interaction logs (BigQuery)                                                                                                                           | Breaks any dashboard or saved query filtering on the old value. No governance effect.                                                                                          |
| Span / rate-limiter key               | No                                                                                                                          | Span names, rate-limit bucket keys (`rate-limit-keys` ratchet)                                                                                                                                           | Cosmetic; buckets are per process.                                                                                                                                             |
| Reporting enum                        | Only in 3 ungoverned output schemas (`ttd_list_report_schedules`, `ttd_get_report_schedule`, `cm360_list_report_schedules`) | Error data from `mapReportingError`; the `platform` field of schedule summaries                                                                                                                          | A client-visible value change on those 3 tools. No attested hash moves.                                                                                                        |
| Tool prefix                           | **Yes** (tool `name`)                                                                                                       | Every tool name; governance `PLATFORM_TOOL_PREFIXES`, experiment tool lists                                                                                                                              | Out of scope: renaming tools is a new contract surface.                                                                                                                        |

### Options

**A. Normalize everything to one scheme now.** Moves every governed `definitionHash` on at least three servers (gads, meta, linkedin), requires new `contractId`s or a lockstep governance migration, resets calibration history and needs a tenant guardrail audit. All cost, and no user-visible benefit: the governance repo already reconciles the spellings.

**B. Freeze what is governed, give new platforms one key, normalize only what is free. (Recommended.)**

1. **Record each server's key in `registry.json`** as `platform_key`, equal to its `contractPlatformSlug` (`google_ads`, `meta`, `linkedin_ads`, the prefix elsewhere; `dbm` for dbm). A ratchet requires every governed tool's `contractPlatformSlug` to equal it. This turns today's implicit per-server slug into a reviewed, checked fact.
2. **Freeze the existing `cesteral.platform` values.** A ratchet requires `cesteral.platform == platform_key`, with a closed legacy allowlist of exactly one entry (meta: `meta_ads`) that may only shrink.
3. **Rule for new platforms: one key everywhere.** The tool prefix, `platform_key`, `cesteral.platform`, `contractPlatformSlug`, the factory `platform`, the span and rate-limiter key and the `platform-facts.json` id prefix are all the same `[a-z0-9_]` string, and the template derives them from `platform_key`. Prefer the platform's common short name (`reddit`, not `reddit_ads`), matching most of the fleet.
4. **Normalize the namespaces outside the hash** (separate PR, after decision 4 below):
   - Factory `platform` → `platform_key` on the four servers that differ (dbm `dv360-reporting`, dv360 `dv360-management`, cm360 `cm360-management`, gads `gads`).
   - Reporting enum → `platform_key` values (`google` → `google_ads`, `amazonDsp` → `amazon_dsp`, `microsoft` → `msads`), derived from the registry so a new platform does not need a shared-package edit. The repo is pre-production, so the value change on the three schedule tools is acceptable.
5. **Write down the governance step.** A new platform's governed writes are refused by hosted admission until `cesteral-intelligence` adds its slug to `FIXTURE_COVERAGE_MAP` / `CanonicalPlatform` / `PLATFORM_LOOKUPS` and its key to `PLATFORM_ALIASES`. The new-server guide should say so, and the "propose a new platform" issue template should ask for the key up front so that governance work can start in parallel.

**C. Document the current values and add no rule.** Leaves the template to guess, and the next server adds a ninth spelling.

### Recommendation

**B.** It changes no `definitionHash`, needs nothing from the governance repo beyond what onboarding a platform already requires, and makes the rule enforceable for every future server.

---

## Decision 2: the cross-server contract

### What the contract says vs what ships

`docs/CROSS_SERVER_CONTRACT.md` says every management server **MUST** provide core CRUD, `bulk_update_status`, bid adjustment and `validate_entity`. The guide also called account listing required. What the registry shows:

| Tool / category                 | Ships on                                  | Gaps and variants                                                                                                                                                         |
| ------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| list / get / create / update    | all 11 write servers                      | —                                                                                                                                                                         |
| delete                          | all 11                                    | gads names it `remove_entity`                                                                                                                                             |
| `bulk_update_status`            | all 11                                    | —                                                                                                                                                                         |
| `validate_entity`               | all 11                                    | —                                                                                                                                                                         |
| bid adjustment                  | 10 of 11                                  | **cm360 has none**; dv360 names it `adjust_line_item_bids`                                                                                                                |
| `duplicate_entity`              | 10 of 11                                  | **cm360 has none** (the contract already calls this a coverage gap, not an API limit)                                                                                     |
| `get_pacing_status`             | all 13                                    | — (and a routing eval requires it on every server)                                                                                                                        |
| `search_tools`                  | 10 of 13                                  | **gads, sa360, dbm have none**                                                                                                                                            |
| Account discovery               | 9 dedicated tools                         | Names follow the platform (`list_accounts`, `list_ad_accounts`, `list_advertisers`, `list_user_profiles`); **dv360 and ttd** discover advertisers through `list_entities` |
| Reporting                       | 12 of 13                                  | **dv360** has none; its reporting is `dbm-mcp`, and the routing evals depend on that split                                                                                |
| sa360 (reporting + conversions) | list/get entities, reporting, conversions | No entity writes; exempt by the contract today                                                                                                                            |

### Options

**A. Keep "MUST" and close the gaps.** Add `cm360_adjust_bids`, `cm360_duplicate_entity`, search tools on three servers, account tools on dv360 and ttd. Some of these have nothing to wrap: CM360 traffics placements priced by pricing schedules, with no auction bid to adjust (to be confirmed against the CM360 v5 reference before relying on it).

**B. Tier the contract by server type, with MUST / SHOULD and recorded exceptions. (Recommended.)**

Add a `type` field to each registry entry and check the tiers per type:

| Tier                                                | `management` (11)                                                                                                                                                                                                                  | `reporting` (dbm)                     | `reporting_conversions` (sa360)                                    |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------ |
| **MUST** (checked; a missing tool fails)            | list, get, create, update, delete (`remove_entity` accepted), `bulk_update_status`, `validate_entity`, `get_pacing_status`                                                                                                         | a reporting tool, `get_pacing_status` | entity list/get, reporting, conversion upload, `get_pacing_status` |
| **SHOULD** (checked; a gap needs a recorded reason) | `duplicate_entity`, bid adjustment (`adjust_line_item_bids` accepted), account discovery (a dedicated tool, or `list_entities` with an account-level entity type), `search_tools`, reporting (own tool, or a named sibling server) | `search_tools`                        | `search_tools`                                                     |
| **MAY**                                             | delivery estimate, ad preview, media upload, targeting search, bulk create/update                                                                                                                                                  | —                                     | —                                                                  |

Every MUST is already satisfied. The SHOULD gaps become explicit, reasoned entries (for example in `registry.json` as `contract.exceptions: [{ tool, reason }]`), and the check fails both for a new unrecorded gap and for an exception that is no longer needed. The initial exceptions would be:

| Server           | SHOULD gap         | Proposed reason                                                                 | Follow-up?                                                  |
| ---------------- | ------------------ | ------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| cm360            | bid adjustment     | Ad server; placements are priced by pricing schedules, not bids (confirm first) | No                                                          |
| cm360            | `duplicate_entity` | Coverage gap; get + create would work                                           | Yes: a pure add (new hash, nothing existing moves)          |
| dv360            | reporting          | Provided by `dbm-mcp` (Bid Manager is a separate API and server)                | No                                                          |
| gads, sa360, dbm | `search_tools`     | Unknown. Either small catalogs (18, 17, 6 tools) or never added                 | Decide: add (cheap, generated) or record as "small catalog" |

Names stay as they are. `remove_entity` and `adjust_line_item_bids` are accepted variants, because renaming a tool changes its name, its hash and (for governed tools) its contract identity.

**C. Drop the required list and document what exists.** Removes the one statement a new contributor relies on to know what "done" means, and the scaffold would have nothing to generate stubs from.

### Recommendation

**B.** It describes the fleet honestly, costs no hash changes, and gives the scaffold an exact set to stub: the MUST tools for the chosen `type`, with SHOULD tools offered.

---

## Decisions needed

| #   | Question                                                                                                                         | Recommendation                                                                                                                                  |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Adopt option B for platform keys: freeze governed identifiers, one key for new platforms?                                        | Yes                                                                                                                                             |
| 2   | Is `platform_key` equal to `contractPlatformSlug`, with `cesteral.platform` matching it except a closed legacy allowlist (meta)? | Yes                                                                                                                                             |
| 3   | New platforms use the short name (`reddit`) rather than the `_ads` long form?                                                    | Yes. 10 of the 12 governed servers already use the short form as `contractPlatformSlug`; governance maps either form through `PLATFORM_ALIASES` |
| 4   | Normalize the telemetry `platform` (4 servers) and the reporting enum to `platform_key`?                                         | Yes, once whoever owns the dashboards and BigQuery saved queries confirms nothing filters on the old values                                     |
| 5   | Adopt the tiered contract (option B), with `type` and recorded exceptions in `registry.json`?                                    | Yes                                                                                                                                             |
| 6   | `search_tools` on gads, sa360 and dbm: add them, or record a "small catalog" exception?                                          | Add them: the tool is generated by one factory call, and it keeps the template uniform                                                          |

## What happens once decided

1. **One PR in this repo:** add `platform_key` and `type` to `registry.json`, plus the two ratchets (key consistency with the meta allowlist; contract tiers with recorded exceptions). Update `CROSS_SERVER_CONTRACT.md` and the new-server guide, including the governance onboarding step. No tool definitions change, so no hash moves.
2. **A follow-up PR, if decision 4 is yes:** normalize the telemetry `platform` and the reporting enum.
3. **Separate pure adds:** `cm360_duplicate_entity`, and search tools per decision 6.
4. **The template PR** reads `platform_key` and `type` from the registry entry the scaffold writes, and generates the MUST stubs.
5. **Governance side (`cesteral-intelligence`):** no change is required by this repo's PRs. Onboarding a new platform still means adding its slug to the admission tables and alias maps, as it does today.

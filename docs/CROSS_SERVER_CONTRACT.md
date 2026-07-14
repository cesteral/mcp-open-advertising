# Cross-Server Contract

**Last Updated:** 2026-07-14

Standards that all MCP servers in this repository should follow for consistent AI agent orchestration.

## Server Inventory

| Server         | Prefix       | Type                    | Account ID Field |
| -------------- | ------------ | ----------------------- | ---------------- |
| dbm-mcp        | `dbm`        | Reporting only          | `advertiserId`   |
| dv360-mcp      | `dv360`      | Management              | `advertiserId`   |
| ttd-mcp        | `ttd`        | Management              | `advertiserId`   |
| gads-mcp       | `gads`       | Management              | `customerId`     |
| meta-mcp       | `meta`       | Management              | `adAccountId`    |
| linkedin-mcp   | `linkedin`   | Management              | `adAccountUrn`   |
| tiktok-mcp     | `tiktok`     | Management              | `advertiserId`   |
| cm360-mcp      | `cm360`      | Management              | `profileId`      |
| sa360-mcp      | `sa360`      | Reporting + conversions | `customerId`     |
| pinterest-mcp  | `pinterest`  | Management              | `adAccountId`    |
| snapchat-mcp   | `snapchat`   | Management              | `adAccountId`    |
| amazon-dsp-mcp | `amazon_dsp` | Management              | `profileId`      |
| msads-mcp      | `msads`      | Management              | `accountId`      |

## Required Tool Categories

Every management server MUST provide these tool categories:

### Core CRUD (5 tools)

- `{prefix}_list_entities` — List entities with filters and pagination
- `{prefix}_get_entity` — Get a single entity by type and ID
- `{prefix}_create_entity` — Create a new entity
- `{prefix}_update_entity` — Update an existing entity
- `{prefix}_delete_entity` (or `{prefix}_remove_entity`) — Delete/remove an entity

### Bulk Operations

- `{prefix}_bulk_update_status` — Batch status updates

### Bid Management

- `{prefix}_adjust_bids` or `{prefix}_adjust_line_item_bids` — Batch bid adjustments

### Validation

- `{prefix}_validate_entity` — Validate entity payloads (client-side or server-side)

### Entity duplication

- `{prefix}_duplicate_entity` — Clone an existing entity (get + create under the hood; no native platform "duplicate" API is required). Shipped on **10 of the 11** write servers: dv360, ttd, gads, meta, linkedin, tiktok, pinterest, snapchat, amazon-dsp, msads.
- **cm360 does not expose `duplicate_entity`.** This is the sole write-platform gap; it is a coverage omission, not an API limitation (the get+create clone pattern the siblings use needs no native support). Documented here so enumeration code does not assume fleet-wide coverage; adding it later is a pure add (new tool → new `definitionHash`, no change to existing tools).

### Write-body validation

The strictness of the `data:` / `items:` payload validation differs by server, by design:

- **dv360** carries a generated **per-entity schema registry** (`getEntitySchemaForOperation`). `create_entity` / `bulk_create_entities` validate each payload against the per-entity **create** schema on the dry-run (symbolic preview) path, and `update_entity` validates the merged post-state against the **update** schema. Execute mirrors the platform: the DV360 API is the final validator, so a bulk batch keeps partial success.
- **Every other server** accepts write bodies as `z.record(...)` at the tool-input layer and applies **symbolic validation** on the write paths (status-enum / empty-payload guards, added fleet-wide in the create-path and update-path hardening) rather than a full typed per-entity schema. Those platforms have **no equivalent generated per-entity schema source** to validate against, so porting dv360's registry pattern is a per-platform schema-authoring effort, not a mechanical change — tracked as a known limitation rather than a uniform contract guarantee. The platform API remains the authoritative validator on execute.

### Exceptions

- **dbm-mcp**: Reporting only — provides query tools, not CRUD. No management tools required.
- **sa360-mcp**: Reporting + conversion upload — provides query/insights tools and conversion insert/update. No entity CRUD required.

## Intentional Naming Differences

Some naming differences across servers are intentional and match platform API conventions:

| Concept       | DV360                   | TTD             | Google Ads      | Meta            | LinkedIn        | TikTok             | CM360           | Pinterest       | Snapchat        | Amazon DSP      | MS Ads          |
| ------------- | ----------------------- | --------------- | --------------- | --------------- | --------------- | ------------------ | --------------- | --------------- | --------------- | --------------- | --------------- |
| Delete tool   | `delete_entity`         | `delete_entity` | `remove_entity` | `delete_entity` | `delete_entity` | `delete_entity`    | `delete_entity` | `delete_entity` | `delete_entity` | `delete_entity` | `delete_entity` |
| Bid tool      | `adjust_line_item_bids` | `adjust_bids`   | `adjust_bids`   | `adjust_bids`   | `adjust_bids`   | `adjust_bids`      | N/A             | `adjust_bids`   | `adjust_bids`   | `adjust_bids`   | `adjust_bids`   |
| Status values | `ENTITY_STATUS_ACTIVE`  | `Active`        | `ENABLED`       | `ACTIVE`        | `ACTIVE`        | `ENABLE`/`DISABLE` | `true`/`false`  | `ACTIVE`        | `ACTIVE`        | `RUNNING`       | `Active`        |

### Capability naming variants

Four capabilities carry platform-vocabulary names that differ across servers. Code that enumerates or dispatches by `{prefix}_{verb}_{noun}` must expect **all** of these variants for the same concept — matching a single canonical name will miss servers:

- **Delivery / audience estimate** — `get_delivery_estimate` (dv360, meta, pinterest) · `get_audience_estimate` (snapchat, tiktok) · `get_delivery_forecast` (linkedin) · `get_campaign_forecast` (amazon-dsp)
- **Account listing** — `list_ad_accounts` (linkedin, meta, pinterest, snapchat) · `list_advertisers` (amazon-dsp, tiktok) · `list_accounts` (gads, msads, sa360) · `list_user_profiles` (cm360)
- **Performance reporting** — `get_report(_breakdowns)` (amazon-dsp, msads, pinterest, snapchat, tiktok, ttd) · `get_insights(_breakdowns)` (gads, meta, sa360) · `get_analytics(_breakdowns)` (linkedin)
- **Ad preview** — `get_ad_preview` fleet-wide, except `msads_get_ad_details` (MS Ads exposes ad details rather than a preview endpoint)
- **Targeting discovery** — `get_targeting_options` (linkedin, meta, msads, pinterest, snapchat, tiktok) · `list_targeting_options` (cm360). CM360's tool is a discovery/list read like its siblings; it follows the DCM/CM360 API's `*targeting*` list vocabulary. The name is a **frozen wire identifier** (renaming it would change the published `definitionHash`), so the variant is documented here rather than renamed.
- **Bulk entity mutation** — `bulk_update_entities` (dv360, ttd, meta, linkedin, tiktok, cm360, pinterest, snapchat, amazon-dsp, msads) · `bulk_mutate` (gads). Google Ads names its batch tool after the platform's `GoogleAdsService.Mutate` verb: `gads_bulk_mutate` is a **superset** that applies heterogeneous create/update/remove operations in a single atomic call, whereas the sibling `bulk_update_entities` tools only batch updates. gads still ships `bulk_create_entities` and `bulk_update_status` alongside it, so the create/update/status coverage is complete under different names.

Each name follows its platform's own API vocabulary, so these are intentional — but they are **not** interchangeable by string, and the [server matrix in README.md](../README.md) is the source of truth for which server exposes which.

## Media / creative-asset upload coverage

`{prefix}_upload_image` / `{prefix}_upload_video` are **effect-class** convenience tools that create a reusable media/creative asset (they return an asset handle referenced by ads, not a canonical entity). Coverage is **not uniform**, and the gaps are API limitations, not omissions — a platform only gets an upload tool where its API actually accepts one. Enumeration code must not assume fleet-wide coverage.

| Server         | `upload_image`         | `upload_video`               | Notes                                                                                             |
| -------------- | ---------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------- |
| dv360-mcp      | ✅ binary              | ✅ binary                    | Uploads bytes via the DV360 asset API (`advertisers/{id}/assets`).                                |
| gads-mcp       | ✅ binary              | ⚠️ **YouTube reference**     | See below — Google Ads has **no binary video upload**.                                            |
| meta-mcp       | ✅ binary              | ✅ binary                    | Ad-account media library.                                                                         |
| linkedin-mcp   | ✅ binary              | ✅ binary                    | Vector/registerUpload flow.                                                                       |
| tiktok-mcp     | ✅ binary              | ✅ binary                    | `/file/image` + `/file/video` upload.                                                             |
| snapchat-mcp   | ✅ binary              | ✅ binary                    | Media create → binary POST → poll `READY`.                                                        |
| pinterest-mcp  | ❌ (URL-referenced)    | ✅ binary                    | Image creatives reference URLs directly; only `/v5/media` (`media_type="video"`) takes an upload. |
| ttd-mcp        | ❌                     | ❌                           | See below — no binary media-upload endpoint on TTD's public API.                                  |
| amazon-dsp-mcp | ❌                     | ❌                           | See below — creative writes are subtype-routed and not currently wired.                           |
| cm360 / msads / sa360 / dbm | ❌        | ❌                           | Not applicable to these servers' scope.                                                           |

### gads — no binary video upload (YouTube-referenced)

`gads_upload_image` uploads raw bytes (→ `ImageAsset`), but Google Ads has **no binary video upload**: a video asset is a `YouTubeVideoAsset` that *references* a video already hosted on YouTube. `gads_upload_video` therefore takes a **YouTube video ID** (not a file / not a URL) and creates the `YOUTUBE_VIDEO` asset via `assets:mutate`. Callers must host the video on YouTube first. This differs from DV360 (a separate Google product) which does expose a binary asset-upload API — same company, different API surface, so the two Google servers are intentionally asymmetric here.

### ttd — no media upload (VAST / externally-hosted)

The Trade Desk's public Platform API (REST `/v3` + GraphQL) exposes **no binary media/asset upload endpoint**. TTD creatives reference **externally-hosted assets**: banner creatives point at a hosted `ImageUrl`, and video creatives carry `VastXml` / a hosted VAST URL. There is nothing to "upload" — a video creative is created with `ttd_create_entity` (`entityType: "creative"`, `CreativeType: "video"`, `VastXml`), so no `ttd_upload_video` tool is provided. See the `creative_setup_workflow` prompt for the full flow.

### amazon-dsp — subtype-routed creatives, not wired

Amazon DSP has no plain `POST /dsp/creatives`; creative writes are **subtype-routed** (`/dsp/creatives/image`, `/video`, `/thirdParty`, `/rec`) each with their own vendor media type, and a video creative references an asset from the account's media library. Per `amazon-dsp-api-contract.ts`, creative create/update is **not currently implemented** in this server (the `createPath`/`updatePath` are read-side aggregation only). A `amazon_dsp_upload_video` tool therefore requires implementing subtype-routed creative creation + the media-library asset flow first; it is tracked as a coverage gap rather than shimmed against a non-existent simple endpoint.

## Required Tool Structure

Every tool definition object passed to `registerToolsFromDefinitions()` must include these required fields:

- `name` — Tool name following `{prefix}_{action}` pattern
- `description` — Tool description (>10 chars)
- `inputSchema` — A `z.ZodTypeAny` instance; the factory calls `.parse()` on it for input validation
- `logic` — Async handler function `(input, context, sdkContext?) => Promise<any>`

These fields are strongly recommended and present in all current tool definitions:

- `title` — Human-readable display title (forwarded to MCP SDK as the tool's display name)
- `outputSchema` — A `z.ZodTypeAny` instance describing the structured return type; when present, the factory returns `structuredContent` alongside `content` (MCP Spec 2025-11-25)
- `inputExamples` — Array of `{ label: string, input: Record<string, unknown> }` objects; embedded into the tool description as a markdown Examples section for universal MCP client compatibility
- `annotations` — Object with any combination of `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint` booleans (all current tools provide all four)
- `responseFormatter` — Function `(result, input?) => ContentBlock[]` to format the tool response; when absent, the factory serializes the result to JSON text

### Description Convention for Enum-Keyed Fields

Tools whose `inputSchema` accepts a field bound to a published platform enum (status, objective, optimization-goal, match-type, etc.) **must end their description** with a sentence pointing the model at the resource that lists the valid values:

```
Valid values: see resource `<uri-template-or-uri>`.
```

This keeps the registered `inputSchema` small (no inline enum tables) while preserving discoverability — the model fetches the resource on demand instead of paying the enum-listing tax on every `tools/list` round-trip.

Established field-rule resources:

| Server    | URI template                       | Backed by                                                          |
| --------- | ---------------------------------- | ------------------------------------------------------------------ |
| ttd-mcp   | `ttd-field-rules://{entityType}`   | `packages/ttd-mcp/src/mcp-server/resources/utils/field-rules.ts`   |
| meta-mcp  | `meta-field-rules://{entityType}`  | `packages/meta-mcp/src/mcp-server/resources/utils/field-rules.ts`  |
| msads-mcp | `msads-field-rules://{entityType}` | `packages/msads-mcp/src/mcp-server/resources/utils/field-rules.ts` |

Each resource returns JSON `{ entityType, requiredOnCreate, optionalEnums?, readOnlyFields?, ... }` with `FieldRule[]` entries (`field`, `expectedType`, `hint?`, `suggestedValues?`). The same tables back the corresponding `{platform}_validate_entity` tool, so server-side validation and client-side discovery share a single source of truth.

When adding a new templated resource, register it via `registerTemplatedResourcesFromDefinitions()` from `@cesteral/shared` (see `packages/ttd-mcp/src/mcp-server/server.ts` for the canonical wiring). Provide a `list` callback so clients can enumerate concrete URIs through the standard MCP `resources/list` flow.

## Tool Discovery Flow

Servers with 20+ tools expose a `{prefix}_search_tools` dispatcher that ranks the server's own registry against a natural-language query. Use it to land on the right tool in one round-trip instead of paging through the full inventory.

**Servers exposing the search tool (10):** ttd, meta, dv360, msads, tiktok, pinterest, snapchat, amazon-dsp, cm360, linkedin. The three smallest servers omit it — gads (15 tools), sa360 (16), and reporting-only dbm (6) are under the 20-tool threshold.

**Recommended discovery flow:**

1. **Search** — call `{prefix}_search_tools({ query: "<what you want to do>" })` for narrowing.
2. **Invoke** — call the matched tool with concrete arguments.
3. **Recover** — on validation or lookup error, follow the structured `nextAction` hint in the error payload (often a `read-resource` directive pointing at an `entity-schema://` or enum resource).

The search tool excludes itself from results. Returned items carry `name`, `title`, `description` (truncated to first paragraph), `score`, and `matchedTokens`. The full registry is still listable via the standard MCP `tools/list` request — search is a convenience, not a replacement.

### Worked example (TTD)

```jsonc
// 1. Search
{ "tool": "ttd_search_tools", "input": { "query": "create a campaign" } }
// → results[0].name === "ttd_create_campaigns"

// 2. Invoke
{ "tool": "ttd_create_campaigns", "input": { "mode": "single", "campaign": { ... } } }

// 3. On validation error, response includes:
//    { "nextAction": { "kind": "read-resource", "uri": "ttd-field-rules://campaign" } }
//    Read that resource, fix the payload, retry.
```

## Bulk Result Conventions

All bulk operation tools must return results in this format:

- `results[]` — Canonical per-item array; each item contains:
  - `success: boolean`
  - `error?: string` (present when success is false)
  - `entityId: string` — the affected entity's ID (all current bulk tools use `entityId`)
- `successCount: number` — count of successful items
- `failureCount: number` — count of failed items
- `timestamp: string` (ISO 8601)

Some tools return additional aggregate fields alongside `results[]`:

- `totalRequested: number` — total items submitted
- `totalSuccessful` / `totalSucceeded: number` — aliases for successCount (naming varies by server)
- `totalFailed: number` — alias for failureCount
- `successful[]` / `failed[]` — typed sub-arrays of successful and failed items with enriched fields (e.g., previousStatus, newStatus); present in dv360-mcp bulk tools

These additional fields supplement but do not replace the canonical `results[]` + `successCount` + `failureCount` shape.

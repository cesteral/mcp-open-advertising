# Cross-Server Contract

**Last Updated:** 2026-03-15

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

## Tool Discovery Flow

Servers with 20+ tools expose a `{prefix}_search_tools` dispatcher that ranks the server's own registry against a natural-language query. Use it to land on the right tool in one round-trip instead of paging through the full inventory.

**Servers exposing the search tool:** ttd, meta, dv360, msads, tiktok, pinterest, snapchat.

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

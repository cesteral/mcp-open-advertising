# Cross-Server Contract

**Last Updated:** 2026-03-03

Standards that all management MCP servers (dv360-mcp, ttd-mcp, gads-mcp, meta-mcp, linkedin-mcp, tiktok-mcp) must follow for consistent AI agent orchestration.

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

## Intentional Naming Differences

Some naming differences across servers are intentional and match platform API conventions:

| Concept | DV360 | TTD | Google Ads | Meta |
|---------|-------|-----|------------|------|
| Delete tool | `dv360_delete_entity` | `ttd_delete_entity` | `gads_remove_entity` | `meta_delete_entity` |
| Bid tool | `dv360_adjust_line_item_bids` | `ttd_adjust_bids` | `gads_adjust_bids` | `meta_adjust_bids` |
| Account ID | `advertiserId` | `advertiserId` | `customerId` | `adAccountId` |
| Status values | `ENTITY_STATUS_ACTIVE` | `Active` | `ENABLED` | `ACTIVE` |

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

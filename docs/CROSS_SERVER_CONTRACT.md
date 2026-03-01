# Cross-Server Contract

Standards that all management MCP servers (dv360-mcp, ttd-mcp, gads-mcp, meta-mcp) must follow for consistent AI agent orchestration.

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

Every tool definition must include:
- `name` — Tool name following `{prefix}_{action}` pattern
- `title` — Human-readable display title
- `description` — Tool description (>10 chars)
- `inputSchema` — Zod schema with `.parse()` method
- `inputExamples` — At least 1 example input
- `annotations` — Object with `readOnlyHint` boolean
- `logic` — Async handler function
- `responseFormatter` — Function to format tool response

## Bulk Result Conventions

All bulk operation tools must return results in this format:
- `results[]` — Array with per-item objects containing:
  - `success: boolean`
  - `error?: string` (present when success is false)
  - Entity-specific ID field (e.g., `entityId`, `adSetId`)
- `successCount: number`
- `failureCount: number`
- `timestamp: string` (ISO 8601)

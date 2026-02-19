# DV360 API Gotchas

Known quirks and pitfalls when working with the Display & Video 360 API v4.

## Campaigns cannot be created in DRAFT status
- **Date**: 2026-02-19
- **Source**: API behavior documentation
- **Context**: Unlike Insertion Orders, DV360 campaigns cannot be created with ENTITY_STATUS_DRAFT. They must be created as ENTITY_STATUS_ACTIVE or ENTITY_STATUS_PAUSED.
- **Recommendation**: Create campaigns as PAUSED, configure child entities, then activate.
- **Applies to**: dv360-mcp, `dv360_create_entity`, `mcp.execute.dv360_entity_update`

## updateMask must be precise
- **Date**: 2026-02-19
- **Source**: Evaluator findings
- **Context**: Using overly broad updateMask values (e.g., more than 8 fields) is flagged by the evaluator. The DV360 API processes all masked fields, which can cause unintended side effects if default values overwrite existing settings.
- **Recommendation**: Only include fields you're actually changing in the updateMask. Use `entity-fields://{entityType}` resource to discover valid field paths.
- **Applies to**: dv360-mcp, `dv360_update_entity`, `mcp.execute.dv360_entity_update`

## Full schemas exceed stdio transport limits
- **Date**: 2026-02-19
- **Source**: Claude Desktop integration testing
- **Context**: The full discriminated union schemas for all DV360 entity types exceed ~1MB, causing EPIPE errors on stdio transport. Simplified schemas (~2KB) are used for tool registration instead.
- **Recommendation**: Use simplified schemas for MCP tool definitions. Full schemas are available via MCP Resources (`entity-schema://{entityType}`).
- **Applies to**: dv360-mcp, schema registration

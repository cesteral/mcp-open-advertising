# TTD Entity Patterns

Common patterns for creating, updating, and managing TTD entities.

## Zod enum returns string, cast to TtdEntityType
- **Date**: 2026-02-19
- **Source**: Build troubleshooting
- **Context**: When using `z.enum()` for entity type validation, the result is typed as `string`, not the specific enum type. Passing directly to services that expect `TtdEntityType` causes TypeScript errors.
- **Recommendation**: Cast the validated value: `params.entityType as TtdEntityType`
- **Applies to**: ttd-mcp, tool definitions

## Bulk operations capped at 50 items
- **Date**: 2026-02-19
- **Source**: TTD API documentation
- **Context**: `ttd_bulk_create_entities` and `ttd_bulk_update_entities` accept up to 50 items per call. Exceeding this limit results in a 400 error.
- **Recommendation**: Split larger batches into chunks of 50. The tools enforce this limit via Zod schema validation.
- **Applies to**: ttd-mcp, `ttd_bulk_create_entities`, `ttd_bulk_update_entities`

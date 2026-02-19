# Schema Discipline Learnings

Insights about maintaining schema discipline across entity operations.

## Use entity-fields resource for updateMask construction
- **Date**: 2026-02-19
- **Source**: DV360 workflow patterns
- **Context**: The `entity-fields://{entityType}` resource provides a flat list of all valid field paths. This is the definitive reference for constructing updateMask values in DV360 update operations.
- **Recommendation**: Read `entity-fields://{entityType}` before constructing updateMask. Only include paths for fields you're changing.
- **Applies to**: dv360-mcp, `dv360_update_entity`

# Google Ads GAQL Patterns

Learnings about writing effective GAQL (Google Ads Query Language) queries.

## GAQL requires explicit field selection
- **Date**: 2026-02-19
- **Source**: Google Ads API documentation
- **Context**: Unlike SQL, GAQL requires you to explicitly list all fields you want returned in the SELECT clause. There is no `SELECT *`.
- **Recommendation**: Use the `gaql-reference://all` MCP resource to discover available fields for each resource type.
- **Applies to**: gads-mcp, `gads_gaql_search`, `mcp.execute.gads_query`

## Mutate operations use resource names, not IDs
- **Date**: 2026-02-19
- **Source**: API integration
- **Context**: Google Ads mutate operations reference entities by resource name (e.g., `customers/123/campaigns/456`) rather than bare IDs. The tools handle this mapping internally.
- **Recommendation**: Pass entity IDs to the MCP tools; the service layer constructs the full resource name.
- **Applies to**: gads-mcp, `gads_create_entity`, `gads_update_entity`, `gads_remove_entity`

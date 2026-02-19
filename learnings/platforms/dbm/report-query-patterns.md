# Bid Manager Report Query Patterns

Learnings about DV360 reporting via the Bid Manager API v2.

## Reports are asynchronous
- **Date**: 2026-02-19
- **Source**: Implementation experience
- **Context**: Bid Manager reports are created as queries, then run asynchronously. The flow is: create query -> run query -> poll for completion -> fetch results. The `run_custom_query` tool handles this entire lifecycle.
- **Recommendation**: Set appropriate date ranges and limit dimensions to keep report execution time reasonable.
- **Applies to**: dbm-mcp, `run_custom_query`, `mcp.execute.dbm_custom_query`

## Dimension breadth affects query performance
- **Date**: 2026-02-19
- **Source**: Evaluator findings
- **Context**: Queries with more than 12 dimensions produce very large result sets and may exceed the 15s latency threshold. The evaluator flags these as potential efficiency issues.
- **Recommendation**: Start with 3-5 key dimensions. Add more only if the initial results need further breakdown.
- **Applies to**: dbm-mcp, `run_custom_query`

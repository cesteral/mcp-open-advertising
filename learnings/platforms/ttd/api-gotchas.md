# TTD API Gotchas

Known quirks and pitfalls when working with The Trade Desk REST API.

## Partner token auth requires both headers
- **Date**: 2026-02-19
- **Source**: Initial implementation
- **Context**: TTD API authentication in headers mode requires both `X-TTD-Partner-Id` and `X-TTD-Api-Secret` headers. Missing either one results in a 401 with a generic error message that doesn't indicate which header is missing.
- **Recommendation**: Always validate both headers are present before making API calls. The `TtdHeadersAuthStrategy` handles this.
- **Applies to**: ttd-mcp, all TTD tools

## Payload field count impacts API latency
- **Date**: 2026-02-19
- **Source**: Evaluator observations
- **Context**: TTD entity update payloads with more than 25 fields consistently show higher latency (>20s). The API processes all fields even if unchanged.
- **Recommendation**: Use smaller staged updates rather than sending the full entity payload. Only include fields that actually need to change.
- **Applies to**: ttd-mcp, `ttd_update_entity`, `mcp.execute.ttd_entity_update`

# dbm-mcp Architecture

How `dbm-mcp` is put together and why. For the repo-wide server pattern (tool definition files, session services, auth modes) see [CLAUDE.md](../../../CLAUDE.md); this page covers what is specific to Bid Manager. For the tool list, read `src/mcp-server/tools/definitions/` or the fleet table in the root [README](../../../README.md).

`dbm-mcp` is the **reporting** server for DV360. It reads; it never writes. Entity management is in [dv360-mcp](../../dv360-mcp/docs/ARCHITECTURE.md).

## Layout

```text
src/
├── index.ts                      # entry point; stdio credentials from env, or HTTP transport
├── config/                       # env parsing (MCP_AUTH_MODE: google-headers | jwt | none, REPORT_* settings)
├── generated/                    # Zod schemas and metadata generated from data/bid-manager-reference.json (committed)
├── mcp-server/
│   ├── server.ts
│   ├── transports/               # streamable-http-transport.ts
│   ├── tools/definitions/        # one *.tool.ts per tool; index.ts exports allTools
│   ├── tools/utils/              # query-validation.ts, resolve-session.ts
│   ├── resources/definitions/    # filter-types, metric-types, report-types, compatibility-rules, query-examples
│   └── prompts/definitions/      # four workflow prompts
├── services/
│   ├── session-services.ts       # per-session BidManagerService
│   └── bid-manager/              # BidManagerService, auth-bridge, report-parser, report-timing, retry-policy
└── utils/                        # date, math, metrics, platform (rate limiter), errors/
data/                             # bid-manager-reference.json + schema: the source for generated/
scripts/generate-types.ts         # data/ → src/generated/
```

## Tools

Six tools, all read-only: `dbm_get_campaign_delivery`, `dbm_get_performance_metrics`, `dbm_get_historical_metrics`, `dbm_get_pacing_status` (prebuilt reports), and `dbm_run_custom_query` (any valid Bid Manager query).

## How a report runs

Bid Manager reports are asynchronous, so `BidManagerService` drives the whole sequence: **create query → run query → poll the report until it finishes → download the CSV → parse it**. It uses the `googleapis` client (`queries.create`, `queries.run`, `queries.reports.get`) rather than the shared HTTP client, and it owns its polling and retry loop instead of calling the shared `executeWithRetry`. The server card therefore publishes `retry: null` for this server.

- **Auth.** `auth-bridge.ts` wraps the shared `GoogleAuthAdapter` as the OAuth2 client `googleapis` expects, so tokens refresh through the same path as every other Google server.
- **Retries.** `retry-policy.ts` decides which failures are worth another attempt and keeps a retry from re-sending a write the platform may already have committed (a report still running resumes polling the same report; it does not POST `queries.run` again). The table is in that file's header.
- **Polling and limits.** `REPORT_POLL_INITIAL_DELAY_MS`, `REPORT_POLL_MAX_DELAY_MS`, `REPORT_POLL_MAX_RETRIES`, `REPORT_QUERY_RETRIES` and `REPORT_RETRY_COOLDOWN_MS` shape the loop.
- **Synchronous cap.** `dbm_run_custom_query` stops after `REPORT_SYNC_MAX_WALL_TIME_MS`. Without the cap, the default poll and retry settings could hold one call for about 72 minutes, longer than the hosted service's request timeout allows.
- **No async variant.** `dbm_run_custom_query_async` (an MCP 2025-11-25 task tool) was removed in the SDK v2 move (#242): v2 has no server-side Tasks API. A run longer than the synchronous wall-time cap has no path today; #245 tracks bringing it back on the `io.modelcontextprotocol/tasks` extension. `report-timing.ts` keeps the worst-case duration any future task TTL must be sized from.
- **Rate limit.** One process-wide `bidmanager` limiter from `utils/platform.ts`.

## Generated metadata and validation

The filter, metric, report-type and compatibility lists are data, not code. `data/bid-manager-reference.json` is the source; `pnpm run generate` (`scripts/generate-types.ts`) turns it into Zod schemas and metadata under `src/generated/`, which are committed. `typecheck` runs the generator first, and `generate` is also wired as `prebuild`.

`tools/utils/query-validation.ts` checks a custom query against that metadata (report type, filter, metric and date-range compatibility), and `dbm_run_custom_query` applies it at schema time. Validation errors point the caller at the resources that explain the rules.

| Resource URI                | Contents                          |
| --------------------------- | --------------------------------- |
| `filter-types://all`        | Filter types                      |
| `metric-types://all`        | Metric types                      |
| `report-types://all`        | Report types                      |
| `compatibility-rules://all` | Which filters and metrics combine |
| `query-examples://all`      | Worked query examples             |

## Tests

`tests/services/` covers the Bid Manager service, auth bridge and parsing; `tests/tools/` covers tool logic and formatting; `tests/integration/` drives the HTTP transport (query workflow, session lifecycle, error propagation).

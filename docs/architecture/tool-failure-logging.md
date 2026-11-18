# Tool Failure Logging

Reference for this subsystem. [CLAUDE.md](../../CLAUDE.md) keeps a short summary and links here.

Every tool invocation is captured by `InteractionLogger` (`packages/shared/src/utils/observability/interaction-logger.ts`). On failure, the entry adds the upstream HTTP trail (method, URL, status, redacted request/response bodies, per-attempt durations) recorded by `executeWithRetry` via `http-request-recorder.ts`.

Record shape (JSONL): `{ type: "tool_failure", ts, sessionId, requestId, tool, platform, params (redacted), errorCode, errorMessage, errorData, upstream: [{ method, url, status, attempt, durationMs, requestBodyRedacted, responseBodyRedacted, requestHeadersRedacted, responseHeadersRedacted }] }`

Destination is chosen by `INTERACTION_LOG_MODE`:

| Mode     | When                                                     | Storage                                                            |
| -------- | -------------------------------------------------------- | ------------------------------------------------------------------ |
| `gcs`    | Hosted Cloud Run (default when `GCS_BUCKET_NAME` is set) | Instance-unique JSONL in GCS, flushed every 5s                     |
| `file`   | Self-host default                                        | Rotating JSONL at `~/.cesteral/interactions/`                      |
| `stdout` | Self-host with external log pipeline                     | Pino `info`/`error` line per entry — ship via any stdout log agent |

Hosted data is queryable in BigQuery via a JSON external table over `gs://<bucket>/<server-name>/interactions/*.jsonl`.

Redaction lives in **`secret-redaction.ts`**, shared by `http-request-recorder.ts` (which adds header redaction: Authorization, TTD-Auth, DeveloperToken, etc.) and `mcp-errors.ts`. The body/URL patterns cover bearer tokens plus `access_token`/`refresh_token`/`client_secret`/`api_secret`/`developer[_-]?token`/`password`/`assertion`/`id_token` in **both** JSON (`"k":"v"`) and form-urlencoded / query (`k=v`) shapes — the OAuth2 token-exchange and refresh bodies are `x-www-form-urlencoded`, which a `":"`-anchored pattern misses entirely. Response bodies are truncated at 8 KB.

The two used to be separate copies that drifted, and `mcp-errors.ts` held the weaker one: JSON-quoted keys only, no `=` form, no hyphen spelling, no URL handling — one of the four shapes the fleet's clients actually produce (sweep 2026-07-25, 02-F6/F7). `InteractionLogger.logFailure` also redacts `errorMessage` itself rather than trusting callers: `errorData` arrived sanitized while the message beside it, built by interpolating the failing URL or response body, did not (02-F5). **Add new patterns to `secret-redaction.ts` only** — a second copy is how this drifted the first time.

## MCP `notifications/message` and trace context (#247)

The record of truth for what a tool did is Pino plus the `InteractionLogger` above. MCP logging (`notifications/message`) is a courtesy channel on top of it, and the spec has deprecated it (SEP-2577).

**Per-request log level.** On a 2026-07-28 request the level is `_meta["io.modelcontextprotocol/logLevel"]`; `logging/setLevel` is gone. A server must not send `notifications/message` for a request without that field. Every log message from the tool wrapper goes through `sendRelatedLoggingMessage` → `ctx.mcpReq.log`, and the SDK applies the rule: on a modern-era request no `logLevel` means nothing is emitted, and a level filters by severity; on a 2025-era request the session's `logging/setLevel` applies. `packages/shared/tests/utils/modern-log-level-wire.test.ts` pins the modern cases and `related-request-wire.test.ts` the legacy one. **Do not add `server.sendLoggingMessage` call sites**: they skip this filter.

**The `logging` capability is advertised on purpose.** `platform-server-factory.ts` declares `logging: {}` unconditionally so 2025-era clients keep working through the deprecation window. Removal plan: drop the capability (and the `logging` branch of `sendRelatedLoggingMessage`) in the first release after the spec revision that removes logging, which is no earlier than 2027-07-28. Until then, leave it on; the SDK already makes it a no-op for modern requests that did not ask.

**Trace context.** The tool span is parented on the `_meta.traceparent` / `tracestate` of the `tools/call` (SEP-414); when `_meta` carries no valid traceparent, the HTTP `traceparent` / `tracestate` request headers are used; otherwise the span starts a new root (`remoteParentFromRequest`). `baggage` is never read, in either carrier: it is caller-controlled key/value data.

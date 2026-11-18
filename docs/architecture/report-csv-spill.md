# Report CSV Spill

Reference for this subsystem. [CLAUDE.md](../../CLAUDE.md) keeps a short summary and links here.

Large report CSVs (TTD, TikTok, Snapchat, Amazon DSP, Pinterest, MSADS) can be spilled to GCS so the MCP response stays bounded while the full body is still fetchable via a signed URL. Controlled by `@cesteral/shared`'s `spillCsvToGcs` helper, wired into each server's `download_report` tool; the helper reads these envs at call time:

| Env                                   | Default            | Behavior                                                                                                                                                            |
| ------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `REPORT_SPILL_BUCKET`                 | _(unset)_          | When unset, spill is disabled entirely — the download tool returns only the bounded view. When set, the bucket receives CSV/JSON bodies that exceed the thresholds. |
| `REPORT_SPILL_THRESHOLD_BYTES`        | `16777216` (16 MB) | Minimum UTF-8 byte size that triggers a spill.                                                                                                                      |
| `REPORT_SPILL_THRESHOLD_ROWS`         | `100000`           | Minimum parsed row count that triggers a spill (OR'd with the byte threshold — either can fire).                                                                    |
| `REPORT_SPILL_SIGNED_URL_TTL_SECONDS` | `3600` (1h)        | Expiry on the V4 signed URL returned in `spill.signedUrl`.                                                                                                          |

**Object path:** `{server}/{sessionId?}/{reportId}-{timestamp}.{csv\|json}`. Sessioned prefixes enable per-session cleanup sweeps via `SessionServiceStore.onDelete` hooks (wired in each server's `session-services.ts` by `createSessionBoundReportCsvStore` from `@cesteral/shared`, which also owns the `ReportCsvStore` and its GCS mirror). A 24-hour GCS lifecycle rule on the `report_spill` bucket (provisioned in `terraform/main.tf`) is the primary cost control; the session hook is a belt-and-braces deletion that runs earlier when possible. Terraform variables `enable_report_spill` + `report_spill_bucket_name` gate the bucket provisioning.

**On a 2026-07-28 (stateless) request the `{sessionId}` segment is the principal key** (`principal-<hash of the credential fingerprint>`, see [stateless-serving.md](stateless-serving.md)): there is no session end event, so the idle sweep of the principal entry and the 24-hour lifecycle rule are the only cleanup. `report-csv://` reads are authorized against that key; another principal gets not-found.

**The delete hooks fire only for a session the receiving instance actually held.** They used to fire on every `delete()`, including for an id the instance had never seen — which is the normal case once scaled out, and made `DELETE /mcp` a way to sweep another tenant's spilled CSVs by id alone (sweep 2026-07-25, 02-F1). The trade is that a DELETE landing on an instance that does not hold the session no longer sweeps early; the 24-hour lifecycle rule covers it, which is why that rule and not the hook is the primary control.

**Failure modes never break the response.** If spill is enabled but the GCS write fails (permissions, quota, network), the download tool returns `{ spill: { error } }` plus a bounded-view warning, not an error — callers always get their summary/rows.

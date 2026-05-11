# Audit-Grade Observability for AI-Driven Ad Operations

Every AI buyer of ad-tech tooling eventually asks the same question:

> _If my agent does the wrong thing tonight, can I prove what happened tomorrow morning?_

This guide is the short answer.

Cesteral's MCP servers capture every tool invocation as an append-only,
redacted JSONL record. Failures additionally capture the full upstream HTTP
trail — every request, every retry, every response — so when a campaign
update fails or a bid adjustment misfires, you have the evidence to
diagnose it in seconds and the audit trail to satisfy your security review.

This is built in. You don't add SDKs, configure tracing libraries, or stand
up an observability vendor. You set one env var and queries are running.

---

## What gets captured

Every tool call produces one JSONL record. On failure, the upstream HTTP
trail is attached.

```json
{
  "type": "tool_failure",
  "ts": "2026-05-11T08:14:22.117Z",
  "sessionId": "sess_abc123",
  "requestId": "req_94f1a82e",
  "tool": "meta_bulk_update_status",
  "platform": "meta",
  "packageName": "meta-mcp",
  "params": {
    "entityType": "campaign",
    "entityIds": ["23851111", "23852222"],
    "status": "ARCHIVED"
  },
  "errorCode": -32603,
  "errorMessage": "Meta API: insufficient permission to archive campaign 23852222",
  "upstream": [
    {
      "method": "POST",
      "url": "https://graph.facebook.com/v24.0/23851111",
      "status": 200,
      "attempt": 1,
      "durationMs": 184,
      "requestBodyRedacted": "status=ARCHIVED&access_token=[REDACTED]",
      "responseBodyRedacted": "{\"success\":true}"
    },
    {
      "method": "POST",
      "url": "https://graph.facebook.com/v24.0/23852222",
      "status": 403,
      "attempt": 1,
      "durationMs": 92,
      "requestBodyRedacted": "status=ARCHIVED&access_token=[REDACTED]",
      "responseBodyRedacted": "{\"error\":{\"code\":200,\"message\":\"...\"}}"
    }
  ],
  "durationMs": 312,
  "success": false
}
```

That's the actual record shape. No tracing-library conversion, no sampling,
no "we'll add full request bodies in the enterprise tier."

---

## What you can answer

The records land in BigQuery (hosted) or rotating JSONL (self-host).
A few one-liners:

```sql
-- Top failing tools by platform in the last 7 days
SELECT tool, platform,
       JSON_VALUE(upstream[OFFSET(0)].status) AS upstream_status,
       COUNT(*) AS failures
FROM mcp_interactions
WHERE type = 'tool_failure'
  AND ts > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
GROUP BY 1, 2, 3
ORDER BY failures DESC
LIMIT 50;

-- Every bid adjustment a specific user made yesterday
SELECT ts, tool, JSON_VALUE(params, '$.customerId') AS customer_id, params
FROM mcp_interactions
WHERE sessionId = 'sess_abc123'
  AND tool LIKE '%adjust_bids%'
  AND ts BETWEEN '2026-05-10' AND '2026-05-11';

-- 4xx error rate by platform — is one ad network rejecting writes more than others?
SELECT platform,
       COUNTIF(SAFE_CAST(JSON_VALUE(upstream[OFFSET(0)].status) AS INT64) BETWEEN 400 AND 499)
         / NULLIF(COUNT(*), 0) AS four_xx_rate,
       COUNT(*) AS total
FROM mcp_interactions
WHERE type = 'tool_failure'
  AND ts > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 DAY)
GROUP BY 1
ORDER BY four_xx_rate DESC;

-- Reconstruct the exact upstream call that caused a customer-reported issue
SELECT requestId, tool, errorMessage, upstream
FROM mcp_interactions
WHERE requestId = 'req_94f1a82e';
```

---

## Redaction

Records are redacted before they leave the process. The redactor strips:

- **Headers**: `Authorization`, `TTD-Auth`, `DeveloperToken`, OAuth bearers,
  platform-specific token headers
- **Body fields**: `access_token`, `refresh_token`, `client_secret`,
  `password`, and other common token-shaped JSON fields
- **Response bodies**: truncated at 8 KB to prevent accidental PII spillover

The redaction surface lives in
[`http-request-recorder.ts`](../../packages/shared/src/utils/http-request-recorder.ts)
and is unit-tested. If a platform-specific header gets added that contains
credentials, add it to the redactor — that's the single place to extend.

---

## Where the data lands

Pick one mode by setting `INTERACTION_LOG_MODE`:

| Mode     | When to use                                                         | Storage                                                 |
| -------- | ------------------------------------------------------------------- | ------------------------------------------------------- |
| `gcs`    | Hosted (Cloud Run, GKE) — the default when `GCS_BUCKET_NAME` is set | Instance-unique JSONL in GCS, flushed every 5s          |
| `file`   | Self-host default                                                   | Rotating JSONL at `~/.cesteral/interactions/`           |
| `stdout` | Self-host with an existing log pipeline (Datadog, Loki, etc.)       | One Pino line per entry — ship via any stdout log agent |

For hosted mode, attach BigQuery as an external table once:

```sql
CREATE EXTERNAL TABLE mcp_interactions
OPTIONS (format='JSON',
         uris=['gs://<your-bucket>/<server-name>/interactions/*.jsonl']);
```

Then schedule the queries above into Looker / Looker Studio / your dashboard
of choice. There is no separate vendor relationship to procure.

---

## Trust posture

A short summary you can hand to your security review:

- **Append-only**. Records are never mutated after write.
- **Redacted at the source**. Secrets are stripped before the entry is
  written, not "before it's shown in the UI."
- **Server-isolated**. Each MCP server writes to its own prefix; queries
  are scoped per platform.
- **Open source**. The redaction list, the field schema, and the upstream
  capture path are all in the repository. Audit them yourself.
- **No third party**. The data ships to your GCS bucket and your BigQuery
  project. Cesteral does not see your logs.

---

## See also

- [`packages/shared/src/utils/interaction-logger.ts`](../../packages/shared/src/utils/interaction-logger.ts) — implementation
- [`packages/shared/src/utils/http-request-recorder.ts`](../../packages/shared/src/utils/http-request-recorder.ts) — upstream capture + redaction
- [`CLAUDE.md`](../../CLAUDE.md#tool-failure-logging) — internal reference (record shape, env vars)

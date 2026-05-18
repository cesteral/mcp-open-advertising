# Demo Transcript — Meta Ads MCP in Claude Desktop

This is what the [10-minute Meta Ads path](quickstart.md#path-a-meta-ads-recommended)
actually looks like once running. Five prompts, real responses, redacted account
IDs.

> **Editing note**: sections marked `<!-- TODO -->` are placeholders. Paste
> excerpts from a real Claude Desktop session over them, redacting account IDs
> and campaign names as needed. Keep the framing prose intact.

---

## Setup

[Full quickstart](quickstart.md#path-a-meta-ads-recommended) — three commands:

```bash
git clone https://github.com/cesteral/mcp-open-advertising.git
cd mcp-open-advertising
pnpm install
META_ACCESS_TOKEN="..." pnpm --filter @cesteral/meta-mcp dev:http
```

Then add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "meta-ads": {
      "url": "http://localhost:3005/mcp"
    }
  }
}
```

Restart Claude Desktop. The `meta-ads` server should appear in the MCP
indicator with 27 tools available.

---

## 1. Account discovery

**Prompt**:

> List my Meta ad accounts.

**Tool called**: `meta_list_ad_accounts`

**Response excerpt**:

<!-- TODO: paste 3-6 lines of Claude's reply showing the account list,
with the names/IDs redacted to act_XXXXX or "Brand A / Brand B". -->

**What this proves**: the server boots, auth survives the Graph API, and the
27 advertised tools are actually callable.

---

## 2. Performance read

**Prompt**:

> Show me last 7 days of campaign performance for account act_XXXXX. Sort by
> spend descending.

**Tool called**: `meta_get_insights`

**Response excerpt**:

<!-- TODO: paste Claude's reply. A short table or summary like:
"Top 3 campaigns in the last 7 days:
1. Holiday Sale 2025 — $4,820 spend, $0.62 CPM, 1.8% CTR
2. Brand Awareness Q2 — $2,140 spend, $0.71 CPM, 0.9% CTR
3. ..."
-->

**What this proves**: reporting works end-to-end (`meta_get_insights` is a
read-heavy path that exercises pagination, field selection, and date
handling). This is the path most evaluators try second.

---

## 3. Targeting breakdown

**Prompt**:

> For the top campaign, break performance down by age and gender.

**Tool called**: `meta_get_insights_breakdowns`

**Response excerpt**:

<!-- TODO: paste Claude's response showing the breakdown — e.g. a per-segment
table or a short prose summary like "25-34 women drove 41% of spend at the
lowest CPC; 55+ shows declining performance week-over-week." -->

**What this proves**: rich dimensional analysis is reachable in one turn,
no manual JSON manipulation. This is the kind of question that motivates
self-hosting an AI agent in the first place.

---

## 4. Destructive write — and the elicitation gate

**Prompt**:

> Pause campaigns XXXXX1 and XXXXX2.

**Tool called**: `meta_bulk_update_status` with `status: "PAUSED"` and two
entity IDs.

**What happens**: Claude Desktop surfaces an elicitation prompt before the
API call:

```
Bulk status update

You are about to set status='PAUSED' on 2 campaign(s).

Status changes affect spend and delivery immediately. Some transitions
(archive, delete) are irreversible on most platforms.

Affected:
  • XXXXX1
  • XXXXX2

[Confirm bulk status change ☐] [Cancel]
```

<!-- TODO: paste the actual elicitation card screenshot or its rendered
text from Claude Desktop, plus Claude's follow-up response confirming the
operation succeeded after you click confirm. -->

**What this proves**: every destructive write on the connector is gated
behind an MCP elicitation. Clients that don't support elicitation fall back
to a documented non-interactive contract. See
[Built for Production](../../README.md#built-for-production) for the full
list of gated tools.

---

## 5. Audit trail

**Prompt** (run in a separate shell, not in Claude):

```bash
tail -1 ~/.cesteral/interactions/meta-mcp.jsonl | jq .
```

**Output excerpt**:

<!-- TODO: paste a real JSONL record from the file (a successful tool call,
not a failure). Make sure access_token / authorization headers are already
[REDACTED] by the recorder — they should be by default. -->

```json
{
  "type": "tool_call",
  "ts": "2026-05-11T...",
  "sessionId": "sess_...",
  "tool": "meta_bulk_update_status",
  "success": true,
  "durationMs": ...,
  ...
}
```

**What this proves**: every action your AI agent takes is captured to
append-only JSONL with secrets redacted at the source. For production, set
`INTERACTION_LOG_MODE=gcs` and a `GCS_BUCKET_NAME` — same records, flushed
to GCS every 5 seconds, queryable from BigQuery. See the
[observability guide](observability.md).

---

## What you've just demonstrated

Five prompts; one auth credential; one local process; no vendor signup. The
connector handled account discovery, reporting, dimensional analysis, a
gated destructive write, and produced an audit record for each call.

The full fleet (12 more servers) follows the same pattern. Swap
`@cesteral/meta-mcp` for `@cesteral/gads-mcp`, `@cesteral/ttd-mcp`, etc.
in the dev command and the steps repeat.

---

## Next

- [Quickstart](quickstart.md) — the same setup as a step-by-step
- [Built for Production](../../README.md#built-for-production) — safety + observability story
- [Observability](observability.md) — audit / BigQuery / redaction details
- [Compare OSS connectors vs Cesteral Intelligence](https://cesteral.com/compare?utm_source=github&utm_medium=demo-transcript&utm_campaign=next-steps)

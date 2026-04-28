# MCP Tasks Primitive (SEP-1686) — Adoption Plan

**Status:** Future / not scheduled. This is a design note, not an executing-plans plan.

**Goal:** Adopt the MCP Tasks primitive ([SEP-1686](https://modelcontextprotocol.io/community/seps/1686-tasks), Final in spec `2025-11-25`) so async server flows stop being agent-orchestrated tool chains and become host-orchestrated task lifecycles. The headline payoff is **tool deletion**: ~14–18 tools across 7 servers collapse once Tasks-aware clients exist.

## Why

Today, every async upstream API is exposed as a 2- or 3-tool chain that the LLM has to orchestrate:

| Server      | Chain                                                                      |
| ----------- | -------------------------------------------------------------------------- |
| ttd-mcp     | `ttd_submit_report` → `ttd_check_report_status` → `ttd_download_report`    |
| ttd-mcp     | `ttd_create_campaigns_job` → `ttd_get_job_status`                          |
| meta-mcp    | report submit / poll / download                                            |
| sa360-mcp   | `sa360_submit_report` → `sa360_check_report_status` → `sa360_download_report` |
| msads-mcp   | report submit / poll / download                                            |
| tiktok-mcp  | report submit / poll / download                                            |
| snapchat-mcp| report submit / poll / download                                            |
| amazon-dsp-mcp | report submit / poll / download                                         |
| pinterest-mcp | report submit / poll / download                                          |
| dbm-mcp     | `dbm_run_custom_query` (sync) vs `dbm_run_custom_query_async`              |

SEP-1686 documents the failure modes of this pattern: agents hallucinate job IDs, end their turn while "waiting," or skip polling entirely. The fix is to move polling from the model into the host application via a wire-level lifecycle.

## What it actually is on the wire

The same tool serves both sync and async callers. A client opts into async by attaching task metadata to *any* `tools/call`:

```json
{ "method": "tools/call",
  "params": {
    "name": "ttd_create_campaigns_job",
    "arguments": { ... },
    "_meta": { "modelcontextprotocol.io/task": { "taskId": "<client-uuid>", "keepAlive": 60000 } } } }
```

Server then:

- emits `notifications/tasks/created`
- responds immediately with status + `pollFrequency` hint
- exposes `tasks/get` (status), `tasks/result` (final content), `tasks/cancel`
- terminal states immutable: `completed | failed | cancelled` (also `working`, `input_required`)
- task ID is **requestor-generated** (lets clients dedupe/retry idempotently)
- `tasks` capability declared at init

Polling moves from the agent to the host application.

## SDK status (verified 2026-04-28)

`@modelcontextprotocol/sdk@1.27.1` ships full SEP-1686 support:

- Schemas: `TaskStatusSchema`, `TaskStatusNotificationSchema`, `GetTaskRequestSchema`, `GetTaskPayloadRequestSchema`, plus `tasks/get` / `tasks/result` / `tasks/cancel` request/response shapes
- Types: `TaskStatus = "working" | "input_required" | "completed" | "failed" | "cancelled"`
- Constants: `RELATED_TASK_META_KEY`
- `experimental/tasks/interfaces.ts` — `TaskStore` interface, `isTerminal()` helper
- `experimental/tasks/stores/in-memory.ts` — `InMemoryTaskStore`
- Reference example: `examples/server/simpleTaskInteractive.{ts,js}` (~600 lines, demonstrates capability declaration, `_meta` augmentation, full lifecycle, plus task-aware elicitation/sampling). Matching `simpleTaskInteractiveClient` ships in `examples/client/`.

We do not need to hand-roll the wire protocol. `setRequestHandler(GetTaskRequestSchema, …)` and friends are the integration points.

## Pilot scope

**One server, one tool.** Target: `ttd_create_campaigns_job` in `ttd-mcp`.

Rationale:

- TTD already returns a job ID — that becomes the upstream pointer behind the MCP `taskId`.
- `ttd_get_job_status` already exists, so we A/B against a flow that currently works.
- No CSV / spill complications.
- Single server, no `@cesteral/shared` churn.

Steps:

1. Add `tasks` capability to ttd-mcp `Server` constructor.
2. In the existing `ttd_create_campaigns_job` handler, detect `_meta["modelcontextprotocol.io/task"]`. If present:
   - Submit to TTD as today.
   - Persist `{ mcpTaskId → ttdJobId, status, keepAliveUntil }` via `InMemoryTaskStore` from the SDK.
   - Emit `notifications/tasks/created`.
   - Return `working` with a sensible `pollFrequency`.
3. Wire `tasks/get` → translate to TTD `GetJobStatus`, map states.
4. Wire `tasks/result` → return the same content the sync path returns when terminal.
5. Wire `tasks/cancel` → call TTD's cancel endpoint where supported, else mark `cancelled` locally.
6. Keep the legacy `ttd_get_job_status` tool — fallback for non-Tasks clients until adoption is proven.

Definition of done:

- A `tools/call` with `_meta.task` returns immediately; `tasks/get` polls; `tasks/result` returns the final payload.
- A `tools/call` *without* `_meta.task` is byte-identical to today's behavior.
- Inline comment in the handler documenting the scale-out caveat (in-memory store is per-instance; same pattern as `report-csv://`).

## Out of scope for the pilot

- Cross-instance task store. `InMemoryTaskStore` is fine for the pilot — same scale-out caveat we already document for `report-csv://` resources. A GCS-backed `TaskStore` is a follow-up.
- Migrating reports (TTD/Meta/msads/sa360/etc.) — wait for the pilot to validate ergonomics.
- Any shared `TasksRegistry` abstraction in `@cesteral/shared` — premature; ship the pilot, then extract.
- Any change to the legacy 3-tool API surface.

## Preconditions before scheduling

1. **Client demand.** At least one host (Claude Desktop, Cursor, MCP Inspector, etc.) must actually exercise the Tasks primitive end-to-end. Until then, server-side support is dead code; the legacy chain keeps working.
2. **Spec stability check.** SEP-1686 is Final, but the 2026 roadmap calls out follow-up work on retry semantics and result-expiry policies. Re-read the spec before scheduling and confirm no breaking shape changes have landed.

## Follow-up after pilot lands

Roll out to async report flows in this order (cheapest first):

1. **dbm-mcp** — collapse `dbm_run_custom_query` + `dbm_run_custom_query_async` into one tool with optional `_meta.task`.
2. **TTD reports** — biggest surface area, biggest payoff.
3. **Meta / sa360 / msads / tiktok / snapchat / amazon-dsp / pinterest** — fleet rollout. Likely worth extracting a shared `TasksAdapter` helper in `@cesteral/shared` after server #2.

For long-running reports backed by GCS spill, the upstream platform's report ID is the natural durable anchor; the MCP `taskId` becomes a thin pointer the same way it does for the TTD pilot.

## Open questions

- Does any current client emit `_meta["modelcontextprotocol.io/task"]` in `tools/call`? Confirm before scheduling.
- Once a Tasks-aware client lands, do we keep the legacy 3-tool report chain forever or deprecate it on a timeline? (Repo is pre-production — breaking changes are free per `feedback_no_backward_compat.md`, so deprecation is the default.)
- Cross-instance task durability: GCS-backed `TaskStore` (cheap, eventually consistent) vs. ride-the-upstream-job-id (no new infra). Likely the latter for report flows since the upstream platform already owns durability.

## References

- [SEP-1686: Tasks (Final)](https://modelcontextprotocol.io/community/seps/1686-tasks)
- [TS SDK PR #1041](https://github.com/modelcontextprotocol/typescript-sdk/pull/1041) — reference implementation
- [TS SDK issue #1060](https://github.com/modelcontextprotocol/typescript-sdk/issues/1060) — adoption tracker
- Local: `node_modules/.pnpm/@modelcontextprotocol+sdk@1.27.1_*/node_modules/@modelcontextprotocol/sdk/dist/esm/examples/server/simpleTaskInteractive.js`
- [2026 MCP Roadmap](https://blog.modelcontextprotocol.io/posts/2026-mcp-roadmap/)

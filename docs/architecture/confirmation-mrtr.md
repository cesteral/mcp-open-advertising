# Destructive-Operation Confirmation (Multi Round-Trip Requests, #244)

A destructive or sensitive-bulk tool asks the user before it acts. The handler used to send a server-initiated `elicitation/create` mid-call. The 2026-07-28 revision has no server-initiated requests, so the question now travels as a Multi Round-Trip Request (SEP-2322):

1. The handler answers `resultType: "input_required"` with `inputRequests` (a form elicitation) and an opaque `requestState`.
2. The client collects the answer and re-issues the **same** `tools/call` with `inputResponses` and the same `requestState`.
3. The handler runs again from the top, finds the answer and acts (or refuses).

One handler serves both eras. On a 2025-era connection the SDK's legacy shim sends a real `elicitation/create` and re-enters the handler in process, so `related-request-wire.test.ts` (2025) and `confirmation-rounds.test.ts` (2026) cover the same tool code.

No tool changed. The 51 confirmation call sites still call `elicit*Confirmation(...)` from `elicitation-helpers.ts`, which still calls `sdkContext.elicitInput(...)`. The factory supplies a different `elicitInput`: it answers from the retry's `inputResponses`, or throws `ConfirmationRequired`, which the factory turns into the `input_required` result. Code: `packages/shared/src/utils/mcp/confirmation-rounds.ts`, wired in `tool-handler-factory.ts`.

## Capability, per request

`elicitInput` exists only when the client can answer a form on **this** call: `_meta["io.modelcontextprotocol/clientCapabilities"]` (read from `ctx.mcpReq.envelope`) on a 2026-07-28 request, the `initialize`-time capabilities on a 2025-era one. A URL-only client (`elicitation: { url: {} }`) cannot answer a form. With no capability `elicitInput` is undefined, and an irreversible operation is **refused** unless `MCP_ELICIT_DESTRUCTIVE=skip`; a reversible one proceeds. That is unchanged. If the guard below cannot be installed, no channel is offered at all (same refusal, never a silent approval).

## `requestState` is never trusted

It round-trips through the client. It is HMAC-SHA256 sealed (`v1.<body>.<mac>`), signed and **not** encrypted, and carries only: the tool name, a digest of the raw arguments that were asked about, the answers already given, a single-use nonce, an expiry (10 minutes) and a tag of the principal. No platform text, no entity names. It is verified against the principal (client id, credential fingerprint, session or principal key), the tool and the exact arguments. A mismatch in any of them, a bad MAC, an expiry, or `inputResponses` with no state at all is a wire `-32602` ("Invalid or expired requestState"), so an approval for "delete campaign A" cannot ride a retry that deletes campaign B or another tool.

The `-32602` has to come from a wrapper around the SDK's registered `tools/call` handler (`installConfirmationGuard`): a throw from inside a tool callback is turned into an `isError` result by the SDK. The wrapper only rejects. The round is resolved again inside the callback, because the legacy shim re-enters the inner handler directly and bypasses the wrapper.

An answer is keyed by a digest of the exact prompt text, so an answer to one question never satisfies another.

The key is `MCP_REQUEST_STATE_SECRET` (at least 32 characters), else derived from `MCP_AUTH_SECRET_KEY` (jwt mode) under its own label, else a random per-process key. Every instance that can receive a retry needs the same key. With the random key a retry landing on another instance fails closed with `-32602` and the client starts the call again; hosted multi-instance deployments should set `MCP_REQUEST_STATE_SECRET`.

## Replay and double execution

The handler re-runs from the top, so the confirmation must not be a second way to run a write.

- **Approvals are single-use.** Each sealed state carries a nonce, consumed in the `JtiStore` (key prefix `mrtr:`) the first time one of its answers is used. A replayed retry finds it spent, its answer is ignored, and the user is asked again. Only answers actually used in a round are sealed into the next state, so a replayed answer cannot be laundered into a fresh state.
- **Nothing writes before the question.** Every confirmation call site precedes the first platform write (audited for all 51: only `getEntity`, dry-run and assigned-targeting reads come first). The factory fails the call loudly if an upstream `PUT`/`PATCH`/`DELETE` was recorded before a confirmation was requested. A `POST` cannot be classified (GraphQL, Google Ads search and Microsoft Advertising use it for reads), so that case rests on the audit.
- **Decision tokens are consumed once, on the executing round.** The factory verifies the token (and consumes its `jti`) before the tool runs, as always. A round that ends in `input_required` has not executed, so the factory calls `JtiStore.release(jti)` and the retry, which carries the same token, is admitted instead of rejected as `REPLAYED_JTI`. Net: consumed exactly once, by the round that executes. A store without `release` makes the retry fail as a replay (fail closed; mint a new token). A declined confirmation leaves the token spent. The token must outlive the user's thinking time.
- **Dry run never prompts.** Tools return their dry-run result before they confirm. If one reaches a confirmation with `dry_run: true`, `elicitInput` throws instead of asking.

## What changed on the wire

2026-07-28 clients get `input_required` from a destructive tool and must retry with `inputResponses`; 2025-era clients see the same `elicitation/create` as before, now sent by the SDK's shim. The legacy shim's per-leg timeout is the SDK default (10 minutes). Tool definitions and `definitionHash`es did not move.

## Not covered here

`ensureRequiredFieldValue` (dv360 missing-id elicitation) and the three conformance `test_elicitation*` tools call `elicitInput` too, so they use the same path; they are not destructive confirmations and were not re-reviewed for idempotency.

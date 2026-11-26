# Destructive-Operation Confirmation (Multi Round-Trip Requests, #244)

A destructive or sensitive-bulk tool asks the user before it acts. The handler used to send a server-initiated `elicitation/create` mid-call. The 2026-07-28 revision has no server-initiated requests, so the question now travels as a Multi Round-Trip Request (SEP-2322):

1. The handler answers `resultType: "input_required"` with `inputRequests` (a form elicitation) and an opaque `requestState`.
2. The client collects the answer and re-issues the **same** `tools/call` with `inputResponses` and the same `requestState`.
3. The handler runs again from the top, finds the answer and acts (or refuses).

One handler serves both eras. On a 2025-era connection the SDK's legacy shim sends a real `elicitation/create` and re-enters the handler in process, so `related-request-wire.test.ts` (2025) and `confirmation-rounds.test.ts` (2026) cover the same tool code.

No tool changed. The 51 confirmation call sites of the time still call `elicit*Confirmation(...)` from `elicitation-helpers.ts`, which still calls `sdkContext.elicitInput(...)`. The factory supplies a different `elicitInput`: it answers from the retry's `inputResponses`, or throws `ConfirmationRequired`, which the factory turns into the `input_required` result. Code: `packages/shared/src/utils/mcp/confirmation-rounds.ts`, wired in `tool-handler-factory.ts`.

## A governance approval is the confirmation (B6)

On the governed path a person has already approved the write in governance, so the connector does not ask again. When the call carries a decision token that **verified on this call** and names an `approvalId`, `confirmDestructive` returns `true` without eliciting, for irreversible and reversible operations alike, and audits `approved_by_governance`. The token's `actionHash` binds the exact executable args and contract, and its `jti` is consumed once, so that approval covers exactly this call. In-client elicitation is for callers without one. This is what lets the Intelligence gateway, whose MCP client declares no elicitation capability, execute an approved irreversible write instead of getting `refused_no_channel`.

The order in `confirmDestructive`: `MCP_ELICIT_DESTRUCTIVE=skip` first, as before; then the governance approval; then the no-channel and elicit branches. The factory puts the verified `jti` and `approvalId` on the call's `confirmationAudit` scope, only when the verdict is `ok`, in `warn` mode as in `enforce`, and `confirmDestructive` reads them there, so no call site changed.

None of these skip:

- no token;
- a token that fails verification, in any mode (under `enforce` the call is rejected first; under `warn` it goes on and is asked or refused as today), including a token approved for different args;
- a verified token without `approvalId`, which is a machine caller admitted by policy, not by a person;
- token mode `off`, where nothing is verified;
- a dry run, which still never prompts and never executes;
- field elicitation (`ensureRequiredFieldValue` and other direct `elicitInput` calls), because a missing value is not a confirmation.

Tests: `packages/shared/tests/utils/governance-approval-confirms.test.ts`, through the real factory on both eras.

## Capability, per request

`elicitInput` exists only when the client can answer a form on **this** call: `_meta["io.modelcontextprotocol/clientCapabilities"]` (read from `ctx.mcpReq.envelope`) on a 2026-07-28 request, the `initialize`-time capabilities on a 2025-era one. A URL-only client (`elicitation: { url: {} }`) cannot answer a form. With no capability `elicitInput` is undefined, and an irreversible operation is **refused** unless `MCP_ELICIT_DESTRUCTIVE=skip` or a verified governance approval (above); a reversible one proceeds. That is unchanged. If the guard below cannot be installed, no channel is offered at all (same refusal, never a silent approval).

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

## Coverage: every irreversible path is confirmed as irreversible

A tool that can make a change no tool on its server can undo confirms it as **irreversible** (`irreversible: true` in `confirmDestructive`), before its first upstream write and outside any failure-recording `try/catch`. Without a channel that is a refusal (`refused_no_channel`), not `allowed_no_channel`. What counts as irreversible:

- **A delete or an archive**: `elicitDeleteConfirmation`, `elicitBulkDeleteConfirmation`, `elicitArchiveConfirmation`, as before. Deletes inside a `manage` tool use them too: `ttd_manage_bid_list` (`delete`), `msads_manage_criterions` (`delete`).
- **A terminal status value.** Which values are one-way is a platform fact with one source: `registry.json`, `servers[].operational.terminalStatusValues` (DV360 `ENTITY_STATUS_ARCHIVED`, TTD `Archived`, Google Ads `REMOVED`, Meta `ARCHIVED`/`DELETED`, LinkedIn `CANCELED`/`PENDING_DELETION`, TikTok `DELETE`, CM360 `PERMANENTLY_ARCHIVED`/`PLACEMENT_STATUS_PERMANENTLY_ARCHIVED`, Pinterest `ARCHIVED`, Microsoft Ads `Deleted`). It reaches the code through `registry-data.generated.ts`; a tool reads it with `terminalStatusValuesFor(TOOL_NAME)` at module load, which throws when the tool is not in that server's `terminalOperations`. Matching is case-insensitive.
  - `*_bulk_update_status` passes `irreversible: isTerminalStatusValue(TERMINAL_STATUS_VALUES, status)` to `elicitBulkStatusChangeConfirmation`, whose `irreversible` input is now required. A reversible target (pause, enable) keeps the permissive fallback.
  - `*_update_entity` calls `assertTerminalTransitionsConfirmed` with `findTerminalTransitions(TERMINAL_STATUS_VALUES, [{ id, payload }])`. `findTerminalTransitions` scans the payload for a terminal value on a status-like key (`status`, `entityStatus`, `Availability`, `intendedStatus`, `activeStatus`, `Status`), limited to the `updateMask` where the tool has one (`restrictToUpdateMask`). An update that sets no terminal value does not prompt. A decline or a refusal throws `irreversibleNotConfirmedError` (`InvalidRequest`, nothing written), because these tools' results have no `confirmed: false` shape.
  - `*_bulk_update_entities` passes the batch's terminal items to `elicitBulkMutationConfirmation` as `terminalItems`: the one prompt becomes the irreversible question, whatever the batch size, listing those items. `gads_bulk_mutate` does the same for its `remove` operations and its `update`s to `REMOVED`, through `assertTerminalTransitionsConfirmed`. Either way **a batch asks once**, before its first write; nothing asks per item.
- **A free-form mutation.** `ttd_graphql_query` confirms every document that defines a `mutation` (comments and strings are blanked first; a query never prompts), and `ttd_graphql_mutation_bulk` confirms every job, both with `elicitIrreversibleOperationConfirmation`. Mutation text cannot be classified reliably (a `bidListDelete` and a create look alike to this server), and both are declared terminal in `registry.json`, so they always confirm as irreversible rather than being exempt. `ttd_graphql_mutation_bulk` is refused against production unless the operator opts in, so on the sandbox this costs one prompt per job.

The audit record and the B6 skip are unchanged for all of these: every helper goes through `confirmDestructive`.

Per-tool behaviour is pinned on the wire by each package's `tests/tools/*-terminal-confirmation-wire.test.ts`, one `describeTerminalConfirmation` call from `@cesteral/shared/testkit`: with no channel it is refused and nothing is sent; declined, asked once and nothing is sent; accepted, asked exactly once and then written; a verified approved token writes without asking; an ordinary input of the same tool is not refused (and, except a reversible bulk status change, not asked). Both eras of the batch question are in `confirmation-rounds.test.ts` (2026-07-28) and `related-request-wire.test.ts` (2025-06-18).

### The ratchet

`scripts/lib/irreversible-confirmation.test.mjs` (fleet snapshot) ties the three sources together. Every tool that carries `destructiveHint: true` **or** owns a `registry.json` terminal operation must make an irreversible confirmation in its definition file (`irreversible-confirmation.mjs` lists what counts: one of the irreversible helpers above, or `elicitBulkStatusChangeConfirmation` with a computed `irreversible`; comments do not count), or be listed in `scripts/lib/irreversible-confirmation-allowlist.json` with the reason it has no irreversible path, naming the call that reverses its effect. The list only shrinks: an entry that now confirms, is no longer a candidate, or is gone fails. The same suite requires every irreversible-looking status a writing tool's schema offers (`irreversibleStatusOptions`) to be in its server's `terminalStatusValues` or in the allowlist's `reversibleStatusValues` (LinkedIn `ARCHIVED`, which LinkedIn reactivates), every declared value to appear in a terminal-operation note, and every tool that reads `terminalStatusValuesFor(TOOL_NAME)` to be declared terminal.

## Audit record

Every confirmation decision leaves one Pino record, `component: "governance-audit"`, `event: "destructive_confirmation"`, beside the `decision_token_verification` record (`logDestructiveConfirmation` in `governance/audit.ts`). It carries the action text (passed through `redactSecretsInText`), `outcome`, `irreversible`, `toolName`, `argsDigest` (`digestArguments` of the raw arguments, the same digest `requestState` is bound to), `principalTag` (the HMAC tag sealed into `requestState`, so never the client id or fingerprint itself), and the `jti` / `approvalId` of a decision token that verified on this call. No raw arguments, no token, no answers. Outcomes: `accepted`, `declined` (including accepting without ticking the box), `cancelled`, `refused_no_channel` (irreversible, no form capability), `allowed_no_channel` (reversible, no form capability, the permissive fallback), `skipped_by_env` (`MCP_ELICIT_DESTRUCTIVE=skip`) and `approved_by_governance` (a verified decision token with an `approvalId`; the record carries its `jti` and `approvalId`). The two bypass-or-refusal outcomes `refused_no_channel` and `skipped_by_env` log at `warn`, the rest at `info`.

The factory puts what the record needs on the call's own request context (`RequestContext.confirmationAudit`), and `confirmDestructive` reads it there, so none of the 51 call sites changed. **Exactly one record per decision, not per round:** a round that only asks throws `ConfirmationRequired` before the record is written; a replayed retry is asked again and so also writes nothing; and on a later round, an answer replayed from the sealed state (`ConfirmationRound.carried`, an answer given in an earlier round and not re-sent) is not recorded again, because the round that received it already did. SDK errors and the dry-run refusal propagate and are not decisions either.

## What changed on the wire

2026-07-28 clients get `input_required` from a destructive tool and must retry with `inputResponses`; 2025-era clients see the same `elicitation/create` as before, now sent by the SDK's shim. The legacy shim's per-leg timeout is the SDK default (10 minutes). Tool definitions and `definitionHash`es did not move.

## Field elicitation (`ensureRequiredFieldValue`) and the conformance tools

These ask for a missing value, not a confirmation, but go through the same `elicitInput`, so the same re-run rules apply. Reviewed in the #244 follow-up:

- **A question must precede every write, and must not sit inside a `try/catch` that records failures.** `dv360_adjust_line_item_bids` asked for missing ids inside its per-item `try/catch`: the question would have been recorded as that item's failure, and a question for item 2 would have come after item 1's PATCH (the retry repeats it, and the factory fails the call). It now resolves every missing id for the whole batch first, and rethrows `ConfirmationRequired` (exported from `@cesteral/shared` for exactly this). Any new code that wraps an `elicitInput` in a catch must do the same.
- **An answer is keyed by the exact prompt text, so two prompts that read alike share one answer.** The per-item prompts name the item (`batch bid adjustment 2 of 3`); without that, one answer would fill the same field of every item.
- The custom-bidding tools (`create_custom_bidding_algorithm`, `manage_custom_bidding_script`, `manage_custom_bidding_rules`) ask only before their first write and with a distinct field per question, so several questions in one call work.
- The `test_elicitation*` conformance tools ask once and are read-only, so a re-run is harmless. `--full` conformance (dbm-mcp, 2026-11-18): all four elicitation scenarios pass.

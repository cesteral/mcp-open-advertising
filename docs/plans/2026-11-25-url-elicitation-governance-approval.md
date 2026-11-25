# Governance Approval over URL-Mode Elicitation (design)

**Status:** draft for review, 2026-11-25. Spans this repo and cesteral-intelligence. Nothing is built. Intelligence references point at its `origin/main` as of 2026-11-25.

**Goal:** a person in an end-user MCP client (Claude, Claude Code) can take a governed write that needs approval, approve it in the browser, and have it run within the same conversation. The decision token never goes through the client or the model. This reuses Intelligence's existing approval model (roles, maker-checker, tiers) instead of adding a second one.

## Two topologies, two gaps

Claude reaches a connector one of two ways. Elicitation helps in both, but the work lands in different places.

|                         | **A. Through the Intelligence gateway** (`/api/mcp`)                                                                                                                                                    | **B. Directly to a connector**                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Auth                    | Intelligence API key or OAuth                                                                                                                                                                           | Intelligence-issued ES256 access JWT (`lib/features/mcp/auth/jwt.ts`, #246 option A): `sub` = user, `org_id`, `client_id`, `mcp:write` |
| Decision token          | Intelligence mints it in-process and attaches it to its own outbound call (`external-governance.ts` `buildDecisionTokenHeaders`, `mcp-connections/client.ts` `extraHeaders`)                            | **No way to get one.** Under `enforce`, every governed write fails `MISSING_TOKEN` (`tool-handler-factory.ts:1091`)                    |
| When approval is needed | The turn parks. The agent is told not to re-run the tool and to poll `get_approval_status`. Inngest `execute-approved-action` runs the write later, server-side (`external-connector-tools.ts:352-363`) | Not reachable                                                                                                                          |
| Gap                     | The user leaves the conversation, and the result arrives out of band                                                                                                                                    | Governed writes are either blocked (`enforce`) or ungoverned (`warn`/`off`)                                                            |

There is also one gap common to both. The connector's in-client confirmation (`elicitation-helpers.ts`, 51 call sites) is a form checkbox whose answer never reaches any audit trail.

## Decision: A first, then B

**Phase A** is Intelligence-only. It needs no new token semantics, no change to the consumption model, and no connector change. It reuses `workflow_approvals`, the approve route and its role checks, and the Inngest execution as they are. It turns "the turn parks, go poll" into "approve in the browser now, then the result comes back in the turn".

**Phase B** extends the same page to direct connector calls. It needs a new server-to-server API, a different consumption model, and a connector-side approval round. Do it only if direct connector access with write scope is meant to be a supported product path. If it isn't, the simpler fix for B is to refuse `mcp:write` on direct connector tokens under `enforce` and send writes through the gateway.

## Phase A: URL elicitation on the gateway (cesteral-intelligence)

When `withGovernance` ends in approval required on a `tools/call` from a client that declares `elicitation.url`, the gateway changes how it responds:

1. It mints the `workflow_approvals` row exactly as today (`governance-steps.ts` `mintApproval`), including the notifications.
2. Instead of the parked text result, it returns `input_required` with a URL-mode elicitation. The URL is the **id-based** approval link, never `approvalToken`; MC-1 and MC-12 in `approval-reference.ts` and `links.ts` already require that for links handed to agents. The `requestState` is sealed (HMAC, bound to the OAuth principal `sub`/`client_id`, the tool, the argument digest, an expiry) and carries the approval id.
3. The user opens the link and signs in with Clerk. The approve route applies `verifyApprovalResponder`, the tier ladder (`sod-enforcement.ts` `getApprovalChainPolicy`) and maker-checker unchanged. Inngest executes on approval, as it does today.
4. The client retries with the same `requestState`. The gateway reads the approval's status:

   | Status                               | Response                                                                                             |
   | ------------------------------------ | ---------------------------------------------------------------------------------------------------- |
   | `pending`                            | `input_required` again, with the same URL. The spec says accept means only consent to open the link. |
   | `executing`                          | `input_required` with a short wait, or a "running" text result                                       |
   | `executed`                           | The tool result from `action_outcomes`, returned as the `tools/call` result                          |
   | `rejected` / `expired` / `timed_out` | A tool error naming the outcome                                                                      |

   Nothing re-dispatches: the retry only reads. Double execution is impossible because Inngest's CAS claim (approved → executing) stays the only executor.

5. If the client can't do URL mode, today's parked response stays, with the link in the text.

Elicitation's limits shape the UX:

- `REQUEST_STATE` should outlive a realistic approval. Use the approval's own `timeoutMinutes`, capped at something like 30 minutes.
- Past that cap, the parked flow and `get_approval_status` remain the fallback.

**Maker-checker applies, and that's correct but worth stating.** The requester is the user behind the OAuth client. `requestedByAgentId` is the `client_id` (migration 0140). `ownAgentProposalVerdict` lets the user approve their own agent's proposal only when the budget effect is `none`. A solo user changing a budget therefore can't approve it themselves on that page: a second person with the right tier must. The page has to say so plainly instead of showing a dead Approve button.

## Phase B: direct connector calls (both repos)

The connector calls Intelligence when there is no valid token. The token is fetched server-to-server on the retry.

```
client ──tools/call(args)──────────────────────────▶ connector (OAuth JWT: sub, org_id, client_id)
                                                       │ verdict MISSING_TOKEN|EXPIRED|REPLAYED_JTI,
                                                       │ mode=enforce, client declares elicitation.url
                                                       │ dry-run(args) in process → expectedPostState
                                                       │ POST /api/connector/approvals (Google ID token)
                                                       │   {contractId, definitionHash, hashAlg,
                                                       │    actionHash, executableArgs, principal, tool,
                                                       │    dryRunResult}
                                                       ├──────────────────────────────▶ Intelligence
                                                       │◀── {approvalId, url, expiresAt}   (runs withGovernance:
                                                       │                                    may also allow or block outright)
client ◀──input_required{url, requestState(apr=approvalId)}──┘
  │ approve page (same as Phase A, executionMode = connector_retry)
client ──tools/call(args, inputResponses, requestState)──▶ connector
                                                       │ verify requestState (principal, tool, args digest)
                                                       │ POST /api/connector/approvals/{id}/claim
                                                       ├──────────────────────────────▶ Intelligence
                                                       │   CAS approved→executing, re-check pause/policy,
                                                       │   mint 120 s token with approvalId
                                                       │◀── {token} once │ {status: pending|rejected|…}
                                                       │ verifyDecisionToken → consume jti → run tool
                                                       │ POST …/{id}/outcome {ok, structuredContent digest}
client ◀──result───────────────────────────────────────┘
```

### Intelligence side

- **`POST /api/connector/approvals`.** Authenticated with a Google ID token from the connector's Cloud Run service account, verified against the pinned fleet SA allowlist. `attestation/verify-deployment-identity.ts` already does this check for server cards; reuse it. Add the route to `proxy.ts` `PUBLIC_ROUTES` like `api/connector/media-assets`. The route:
  - runs `withGovernance` on the posted action, so it can also answer `allow` (mint immediately) or `block`;
  - creates the `workflow_approvals` row with `requestedBy` = the JWT `sub`, `requestedByAgentId` = `client_id`, and `executionMode: "connector_retry"`;
  - is idempotent on `(principal, executable_action_hash)` while pending.
- **Hash projection.** Store and compare the connector's `actionHash`, which is the executable projection (`canonicalizeExecutableArgs` with excludes). That is `policy_decision_logs.executable_action_hash`, **not** `approvedPayload.writeArgsHash`, which hashes raw args (`approved-payload.ts:113`). Comparing across the two breaks whenever excluded or `__` fields are present.
- **The dry-run.** The connector posts its own dry-run result. That's acceptable as connector-attested data (the call is SA-authenticated), but the page must label it as the connector's preview. Intelligence would otherwise have to call the connector's dry-run itself, which in topology B it may not hold platform credentials for (open question).
- **`executionMode: "connector_retry"` rows must be skipped by Inngest `execute-approved-action`.** Otherwise both Inngest and the client's retry would dispatch the write.
- **`POST …/{id}/claim`.** It is SA-authenticated and scoped to the connector service that created the row. It does one CAS, `approved → executing`, then:
  - re-checks pause and policy (today's pre-claim re-check);
  - mints a 120-second token with `approvalId` set;
  - returns the token once.

  A second claim gets `executing`. This keeps the existing "one approval, one execution" rule and puts the mint inside the claim, so a 24-hour approval window never means a 24-hour token.

- **`POST …/{id}/outcome`** moves the row to `executed` and writes `action_outcomes`, so the reconciliation UI and the drift check work for this path too. If the connector never reports, the existing strand reconciler handles it.
- **Identity.** Intelligence checks the requesting principal against the approver (maker-checker) and against tenancy: the JWT `org_id` must own the row. The decision token's `sub` stays the tenant, as it is today.

### Connector side (this repo)

1. **An approval round in the factory, at the token check.** The token is checked before the tool runs, so this goes in `tool-handler-factory.ts`, not in tools. It reuses the #244 machinery:
   - `requestState` sealing, principal binding and argument digest;
   - the single-use nonce;
   - `installConfirmationGuard`'s wire `-32602`.

   `ConfirmationPayload` gains an optional `apr` (the approval id). It is bound to the tool and argument digest, so it can't ride a retry with different arguments.

2. **Capability.** Add `clientCanElicitUrl(...)` beside `clientCanElicit` (`confirmation-rounds.ts`), reading `elicitation.url`. Under the spec, `elicitation: {}` means form only.
3. **When the round is offered.** All of these must hold:
   - mode `enforce`;
   - verdict `MISSING_TOKEN`, `EXPIRED` or `REPLAYED_JTI`;
   - a URL-capable client;
   - `GOVERNANCE_APPROVAL_API_BASE` is set;
   - an OAuth principal is present (`jwt` mode).

   A signature or hash mismatch stays a hard reject, because that is tampering or drift, not a missing approval.

4. **No double confirmation.** When the token carries `approvalId`, `elicitInput` skips the in-client checkbox for that call. Without it (a machine caller under policy), today's confirmation stays.
5. **jti.** The token is fetched on the executing round only, so `consumeOnce` runs once. The #244 `release` path still covers a later in-tool `input_required`.
6. **Fallback.** A URL-less client still gets `Unauthorized`, now with the approval link in the message.
7. **Outbound auth.** Send a Google ID token for Intelligence's audience from the Cloud Run metadata server. Stdio and self-host have no such identity, so they don't take part; they keep today's behaviour.
8. **Tests.**
   - A wire test for both protocol eras.
   - A changed-args retry gets `-32602`.
   - `pending` asks again.
   - A second claim can't execute.
   - A URL-less client gets the fallback.

## Common to both phases: audit the in-client confirmation

This needs no Intelligence work and can ship first. `confirmDestructive` logs only refusals today. Emit one `governance-audit` record per decision with:

- `event: "destructive_confirmation"`;
- the action, outcome (accepted, declined or cancelled), tool, argument digest and principal tag;
- the `jti`/`approvalId` when a token was present.

Record the `MCP_ELICIT_DESTRUCTIVE=skip` bypass too; today it leaves no trace.

## Problems in cesteral-intelligence found while designing this

These stand on their own, separate from this design. All are read from `origin/main`; none has been tested.

1. **`approvalId` is probably missing on approved execution (inferred).** On the permit path, `governanceFromPermit` (`external-governance.ts:288-303`) builds the result with no `approval` field, so `governance.approval?.id` at L1307 is undefined. An Inngest re-execution then mints without `approvalId`, and the connector's audit loses the link to the approval. The only test asserting the claim (`external-governance.action-hash.test.ts:244-251`) mocks `withGovernance`, not the permit path. Phase B relies on the claim.
2. **No `kid` and no previous secret on the mint side.** `mintGovernanceDecisionToken` sets no `kid`, and `GOVERNANCE_DECISION_TOKEN_SECRET_PREVIOUS` is read nowhere in `lib/` or `app/`. The asset resolver verifies against the current secret only. A secret rotation therefore can't overlap: in-flight asset fetches inside the 120-second window would fail, and the connector's `kid` selection is never used.
3. **`docs/architecture/approval-lifecycle.md` is stale.** It says there is no `executing` or `executed` status.

## Client support: the main risk

The spec is clear, but Claude Code's URL-mode support looks unreliable, according to user bug reports from 2026 rather than an Anthropic statement:

- [#88075](https://claudeissues.com/issue/88075-bug-claude-code-v2-1-237-does-not-advertise-url-mode-elicitation-on-mcp-2026-07): v2.1.237 sends `elicitation: {}` with no `url` on the 2026-07-28 handshake.
- [#69555](https://claudeissues.com/issue/69555-bug-url-mode-elicitation-broken-client-capability-dropped-from-form-url-to-2-1-1): the capability was narrowed to `{}`.
- [#35353](https://claudeissues.com/issue/35353-bug-vscode-extension-silently-declines-mcp-url-elicitation-requests): the VS Code extension declines URL requests without showing them.

Anthropic's 2026-11-24 announcement calls elicitation GA without naming modes. Before building anything:

- [ ] Probe Claude (web, Desktop, Code CLI, VS Code) with the dbm-mcp conformance elicitation tools. Record the declared modes and what each client actually renders.
- [ ] If none supports URL mode, the parked flow stays as it is. Phase A still adds value: the id-based link goes in the parked text, and the retry-reads-status behaviour works for any client that retries.

## Security notes

- URLs carry only an opaque id. They contain no `approvalToken`, entity names, amounts, or anything pre-authenticated (spec MUST, and MC-1).
- Tokens move only Intelligence → connector, over SA-authenticated calls. Nothing the client holds can be exchanged for one.
- Principal binding is checked twice: the sealed `requestState` on the server that issued it, and Clerk sign-in plus `verifyApprovalResponder` on the page. A link forwarded to someone outside the org can't be approved by them.
- Rate-limit approval creation per principal; a client can loop on it.
- Approval pages live only on the Intelligence app domain. Clients must show the full URL (spec MUST).

## Rollout

1. Probe the clients. Ship the confirmation audit (connector).
2. Phase A behind a gateway flag. Test it end to end in Claude on one tenant.
3. Fix Intelligence problems 1 and 2.
4. Decide whether direct connector writes are a supported product path. If yes, build Phase B behind `GOVERNANCE_APPROVAL_ROUND=on` on one server and one `enforce` contract. If no, refuse `mcp:write` on direct connector tokens under `enforce`.
5. Update `governance-runtime.md` and `confirmation-mrtr.md` here, and `governance-decision-token.md` and `approval-lifecycle.md` there.

## Open questions

- In topology B, does Intelligence hold the platform credentials to run the dry-run itself, or must it trust the connector's?
- Should `warn` mode offer the round as an optional "approve now" step, to collect approvals before `enforce` is switched on?
- Bulk tools: one approval per call (one `actionHash`), or split per entity by policy? `change_set_approvals` already supports multi-step approval.
- What is the elicitation cap for an approval that needs a second person and may take hours? Past it, does the client fall back to `get_approval_status`?

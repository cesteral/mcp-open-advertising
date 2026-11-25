# Governance Approval over URL-Mode Elicitation (design)

**Status:** draft, revision 2 (2026-11-25), addressing the review on #408. It spans this repo and cesteral-intelligence. Nothing is built. Intelligence references point at its `origin/main` `00c9afa4`.

**Goal:** someone in an end-user MCP client (Claude, Claude Code) takes a governed write that needs approval, approves it in the browser, and gets the result in the same conversation. The decision token never passes through the client or the model. Intelligence's approval model (roles, maker-checker, tiers, personal-workspace rules) is reused, not duplicated.

## Two topologies, two gaps

|                         | **A. Through the Intelligence gateway** (`/api/mcp`)                                                                                                                                                                        | **B. Directly to a connector**                                                                                                         |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Auth                    | Intelligence API key or OAuth. Per-request principal is `MCPAuthResult` (`lib/features/mcp/auth/middleware.ts:31-55`)                                                                                                       | Intelligence-issued ES256 access JWT (`lib/features/mcp/auth/jwt.ts`, #246 option A): `sub` = user, `org_id`, `client_id`, `mcp:write` |
| Decision token          | Intelligence mints it in-process for its own outbound call (`external-governance.ts:1302-1314`)                                                                                                                             | **Unobtainable.** Under `enforce` every governed write fails with `MISSING_TOKEN` (`tool-handler-factory.ts:1091`)                     |
| When approval is needed | Returns `isError: true` text `{status: "approval_required", approvalId, …}` (`governed-outcome.ts:75-83, 211-219`). The agent is told to poll `get_approval_status`. Inngest `execute-approved-action` runs the write later | Not reachable                                                                                                                          |

The connector's in-client confirmation (`elicitation-helpers.ts`, 51 call sites) is a form checkbox, and no audit records its answer.

## Order of work

1. **Confirmation audit (connector, ships on its own).** See the last section.
2. **Phase A (Intelligence gateway only).** A read-only resume path on top of the existing approval page and Inngest execution.
3. **Phase B (both repos)**, only if direct connector writes are a supported product path. If they are not, refuse `mcp:write` on direct connector tokens under `enforce` and send writes through the gateway.

## Phase A: resume a parked approval through the gateway

### A1. Protocol revision

The gateway is hand-rolled, stateless JSON:

- no sessions;
- GET answers 405;
- it sends no server→client requests;
- `MCP_SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"]` (`lib/features/mcp/constants.ts:25-50`);
- `initialize` never reads client capabilities (`transport.ts:228-257`), and a request for 2026-07-28 is downgraded to 2025-06-18 (`protocol.ts:26-28`).

URL elicitation first appeared in 2025-11-25, so the gateway needs a newer revision. **Phase A targets 2026-07-28, not 2025-11-25:**

- **2025-11-25 doesn't fit a stateless endpoint.** The client declares `elicitation.url` only at `initialize`. A stateless gateway has nowhere to keep that, and a server MUST NOT send a URL elicitation (`elicitation/create` or `-32042`) to a client that didn't declare it.
- **2026-07-28 was built for this.** Capabilities come on every request in `_meta["io.modelcontextprotocol/clientCapabilities"]`. The question goes back as an `InputRequiredResult` (`resultType: "input_required"`, `inputRequests`, opaque `requestState`), and the client re-issues the same `tools/call` with `inputResponses` and the same state. Nothing is server-initiated and no session is needed.

Gateway scope for Phase A:

- Accept 2026-07-28: negotiation, the `MCP-Protocol-Version` header (`route.ts:194-204`), and `server/discover`.
- Read per-request client capabilities.
- Return `InputRequiredResult` and accept `inputResponses` + `requestState` on `tools/call`.
- Keep every ≤ 2025-06-18 path unchanged.

**Decision for Intelligence owners:** hand-roll this subset, or serve the 2026 era through the SDK's `createMcpHandler`, as the connector fleet does (`mcp-http-transport-factory.ts:394`). I recommend the SDK path: it brings the SDK's `input_required` and `requestState` handling with it, and the gateway already pins `@modelcontextprotocol/sdk` for tests.

**Who gets which response:**

| Client                                               | Response                                                                                                 |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 2026-07-28 with `elicitation.url`                    | URL round (below)                                                                                        |
| 2026-07-28 without `url`, or any ≤ 2025-06-18 client | Today's parked response, with the id-based approval link and a resume instruction added to the text (A4) |

### A2. The round

The first call ends in approval required (row minted by `mintApproval`, notifications sent as today). The gateway then returns:

- `inputRequests`: one URL-mode `elicitation/create` with `url` = the **id-based** approval link (MC-1/MC-12 in `approval-reference.ts` and `links.ts`; never `approvalToken`) and a one-line message.
- `requestState`: HMAC-sealed, not encrypted, carrying:
  - `apr`: the approval id;
  - `sub`: the binding tuple from A3;
  - `t`: the tool name;
  - `a`: the executable-args digest;
  - `r`: the round number;
  - `exp`: the expiry.

  The scheme is the one the connector already uses (`confirmation-rounds.ts`). The key is a gateway secret shared by every instance.

### A3. Binding and authorization of the resume

Every retry carrying a `requestState` is authorized against the approval row, not just the state. All of these must hold, otherwise wire `-32602` "Invalid or expired requestState":

- The state MAC verifies and `exp` has not passed.
- **Requester:** `row.requestedBy === auth.userId`. For API keys, `userId = apiKey.userId ?? apiKey.createdByUserId` (`middleware.ts:148`).
- **Credential:**
  - OAuth: `row.requestedByAgentKind === "oauth_client"` and `row.requestedByAgentId === auth.clientId`. Binding the client id, not the access token, lets a refreshed token resume.
  - API key: `row.requestedByAgentKind === "api_key"` and `row.requestedByAgentId === auth.tokenId`. A key revoked in between fails authentication before this check.
- **Workspace:** `row.ownerId` / `ownerType` equal the request's `orgId`, or the `userId` for a personal workspace.
- **Tool call:** `row.actionName === params.name`, and the executable-args digest of this retry's `arguments` equals both the sealed `a` and the row's frozen `executable_action_hash` (`policy_decision_logs.executable_action_hash`, the executable projection, not `writeArgsHash`).

### A4. Staying resumable while the browser is open

The constraints:

- The client answers consent with `{action: "accept"}` the moment the user agrees to open the link. That says nothing about completion.
- The TS SDK client re-issues automatically, up to `inputRequired.maxRounds` (default 10), and fails with `InputRequiredRoundsExceeded` after that.
- Re-sending the same prompt on every retry would burn those rounds in seconds.

So the gateway waits on the server, within a bound, and caps the rounds itself:

- **Wait.** On a retry whose `inputResponses` accepts this approval's prompt, the handler polls the row (indexed read by id, every 2 s) for up to `W` seconds. The 2026-07-28 spec allows a server to block until the request is fulfilled.
  - `W` = 240 s, with `/api/mcp` given an explicit `export const maxDuration = 300`. The route sets none today, and the project default isn't stated in the repo.
  - The poll ends early on any status in the table below except `pending`.
- **Re-ask.** If the row is still `pending`, `approved` or `executing` after `W`, the gateway returns `input_required` again with the same URL, and the message says the approval is still open. `r` increments.
- **Round cap.** After `R` = 3 rounds (about 12 minutes of waiting) the gateway stops asking and returns the manual-resume result.
- **Manual resume.** The result is not an error. Its text says the approval is still open, links it, and tells the agent to call the same tool again with the same arguments once it is approved. A fresh call with no `requestState` but a matching binding (A3, minus the state) finds the open row (A6) and goes straight to the wait.

| Row status (on first poll or at the end of a wait) | Gateway answer                                                                                                                                                                                                                                                               |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pending`                                          | Keep waiting. At `W`: re-ask (`r < R`) or manual resume                                                                                                                                                                                                                      |
| `approved` (queued for Inngest, not yet claimed)   | Keep waiting. It is never a final "running" result                                                                                                                                                                                                                           |
| `executing`                                        | Keep waiting                                                                                                                                                                                                                                                                 |
| `executed`                                         | Inspect `executionResult` (A5)                                                                                                                                                                                                                                               |
| `rejected`                                         | Tool error: "Rejected by {role} at {time}"                                                                                                                                                                                                                                   |
| `expired`, `timed_out`, `abandoned`, `superseded`  | Tool error naming the status. `superseded` names the replacement approval id                                                                                                                                                                                                 |
| Client answers `decline`                           | Tool error: "You chose not to open the approval. Approval {id} stays pending: another approver can still approve it, and it will then run server-side." The row is **not** rejected, because declining to open a link is not a rejection and the row may be routed to others |
| Client answers `cancel`                            | Same as `decline`, shorter message                                                                                                                                                                                                                                           |
| State expired, or round cap reached                | Manual-resume result (above)                                                                                                                                                                                                                                                 |

**Rollout gate.** The dbm-mcp conformance fixtures exercise form elicitation only. Phase A needs a URL fixture on the gateway's test harness that drives the whole loop:

1. 2026 client, URL capability.
2. Assert the `input_required` shape and the sealed state.
3. A headless browser opens the link, signs in a test user, and approves.
4. Inngest is stubbed to `executed`.
5. Assert the final result is delivered on the waiting retry.

Add cases for decline, cancel, timeout → re-ask → manual resume, `approved`-while-queued, and a changed-args retry (`-32602`). Phase A does not ship to a client until the probe (see "Client support") shows that client declares and renders URL mode.

### A5. What a resume returns

`execute-approved-action` sets `status = executed` with `executionResult` in one UPDATE (`approval/mutations.ts:2095-2101`) whatever the outcome. The caller ignores that UPDATE's return value (`execute-approved-action.ts:662`), and it writes `action_outcomes` afterwards in a try/catch that only logs (`:704, :771`). So `executed` can mean success, failure or unknown, and the outcome row may never exist. **Resume reads `executionResult` only, never `action_outcomes`.**

| `executionResult`                                | Resume answer                                                                                    |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Missing on an `executed` row                     | Tool error: outcome unknown (treat as unknown)                                                   |
| `success: true`, no `responseContractViolation`  | The connector's result (below)                                                                   |
| `success: true` with `responseContractViolation` | Tool error: "Executed, but the platform response failed validation. See change {id}." No content |
| `success: false`, no `outcomeUnknown`            | Tool error with `error` (and `executionRejected` when present): "Did not run" or "Failed"        |
| `outcomeUnknown: true`                           | Tool error: "The write may or may not have landed. Do not retry; check change {id}."             |

**Disclosure.** `get_approval_status` withholds connector content on purpose. It returns content only to the requester, and only for first-party tools (`change-sets.ts:521-535`), because a connector's answer is third-party text. Resume returns the connector's `content` because it is the answer to the requester's own `tools/call`. An unparked call would have returned the same text to the same caller, and A3 proves the caller is that requester, credential, workspace and call. It carries the same untrusted-content marking the gateway applies to a direct connector result. `get_approval_status` keeps its rule. Resume is a separate, narrower path.

### A6. Re-entry and duplicates

- A fresh call that matches an open row for this binding (`pending`, `approved`, `executing`) attaches to that row instead of minting a second one. The key is requester + credential + workspace + tool + `executable_action_hash`.
- After the row is terminal, a fresh identical call is a new request and goes through governance again. The approval page shows "an identical change ran at {time}" when the previous row was `executed`.

### A7. The approval page says why

The page evaluates the responder rules for the signed-in user before showing Approve, and shows the actual refusal:

- **Personal workspace** (`ownerType === "user"`): there is no maker-checker and no tier ladder (`mutations.ts:376-378`). The owner may confirm, except for a campaign change request whose `holdBasis` is not `supervised_default`. Explicit policy asked for another person, so the row "waits until it expires, unsent" (`mutations.ts:356-374`, ruling C3, `NO_OTHER_APPROVER`). The page must say that, not offer a dead button.
- **Organization:** the responder needs membership and `governance:approve` (`verifyApprovalResponder`, `:332-354`), maker-checker applies, and then the tier ladder (`sod-enforcement.ts` `getApprovalChainPolicy`). A requester approving their own agent's proposal is allowed only when:
  - `allowOwnAgentProposal` is set by the route;
  - the agent kind is known;
  - the frozen risk tier is low or medium;
  - the budget effect is exactly `none` (`agent-principal.ts:131-145`, `mutations.ts:382-408`).

  The web approve route sets `allowOwnAgentProposal` (`approve/route.ts:132`); MCP `respond_to_approval` does not. The page names the failed condition (`not_agent`, `tier`, `budget`, or the tier the ladder requires).

## Phase B: direct connector calls

Phase B reuses A2–A7 (round, wait, round cap, status mapping, page). What differs is who executes, so it adds authentication, a claim and a dispatch marker.

### B1. Authenticating creation and claim

Both calls carry two credentials, in the shape of an RFC 8693 token exchange:

- **Actor: the workload.** A Google ID token from the connector's Cloud Run service account. `verify-deployment-identity.ts` pins `aud` to the connector's own endpoint origin (`:93-120`), so it can't be reused as-is. Add a verifier configured with `aud` = the Intelligence endpoint origin (a new `GOVERNANCE_APPROVAL_API_AUDIENCE`), the same Google issuer check and the same fleet SA allowlist. The SA email also names the connector service.
- **Subject: the user's delegated grant.** The connector forwards the Intelligence-issued access JWT the client presented. Intelligence verifies it with its own key (`iss`, `aud` ∈ `MCP_JWT_AUDIENCES` and equal to the calling connector's audience, `exp`, `scope` ⊇ `mcp:write`). It derives `userId`, `org_id` and `client_id` from the token, never from the body. The token is evidence of the grant, not a credential for calling Intelligence as the user.

The row records the binding:

- `requestedBy` = `sub`;
- `requestedByAgentKind: "oauth_client"`, `requestedByAgentId` = `client_id`;
- owner = `org_id`;
- the connector service;
- the account ids from the executable args;
- `contractId`, `definitionHash`, `hashAlg`, and the connector's `actionHash` as `executable_action_hash`;
- `executionMode: "connector_retry"`.

Claim checks every one of these against its own subject and actor tokens. A refreshed access JWT for the same `sub`, `client_id` and `org_id` is accepted.

### B2. Submission identity and dedup

The connector mints a `submissionId` (random, 128 bits) on the first round and seals it in its `requestState`. Creation is idempotent on `submissionId` across **all** statuses, so a retry of the same submission can never create a second approval, whatever happened to the first. A fresh call without state follows A6: it attaches to an open row with the same binding and action hash, otherwise it creates a new one.

### B3. Claim, dispatch and outcome

The claim follows the dispatch model Intelligence already uses for Inngest (`beginApprovalDispatch`, `mutations.ts:1986-2047`; `dispatchAttemptedAt` means "the write MAY have been sent", `workflow-approvals.ts:392`):

1. **`POST …/claim`.**
   - CAS `approved → executing`, recording a `claimRunId`.
   - Re-check pause and policy.
   - Mint a 120 s token with `approvalId`.
   - Return `{token, claimRunId}`.
2. **The connector verifies the token** (`verifyDecisionToken`, which consumes the `jti`) and runs the tool up to its first platform write. In-tool confirmations and field elicitation all precede the first write (#244 audit).
3. **`POST …/dispatch {claimRunId}` immediately before the first platform write.** This is a CAS that increments `dispatchAttempts` and sets `dispatchAttemptedAt` on first entry only. The connector does not write unless it succeeds. This adds a new factory hook, "before first upstream write", next to the existing upstream-write recorder.
4. **`POST …/outcome {claimRunId, …}`** (B4).

Recovery is decided by the dispatch marker:

| Situation                                                                               | Recovery                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claim response lost, token expired, or a later in-tool `input_required` before dispatch | `dispatchAttempts === 0`: the next retry may **re-claim** the same row (same binding, same `submissionId`). It gets a fresh token and `jti`, so no `release` is needed                                                                                                                                                                        |
| `dispatchAttempts > 0` and no outcome                                                   | Never re-dispatched. The next retry, or the strand reconciler (`approval-strand-reconciler.ts`), settles it as `outcome_unknown` (`markStrandedSendsUnconfirmed`). Where the platform tool accepts an idempotency key, the approval id is passed as that key, and one re-send is allowed, as in `execute-approved-action-dispatch.ts:133-194` |
| `executing`, never dispatched, past the claim window                                    | `endNeverSentApprovals` marks it `abandoned` and the change `failed`, as today                                                                                                                                                                                                                                                                |

`execute-approved-action` skips `executionMode: "connector_retry"` rows, so Inngest and the client retry can never both dispatch.

### B4. Outcome evidence

`POST …/outcome` takes `{claimRunId, status, …}` with `status` one of:

- `succeeded`;
- `failed_before_dispatch` (only valid with `dispatchAttempts === 0`);
- `failed`;
- `unknown` (sent, no answer).

For `succeeded` the body carries:

- the tool's `structuredContent`, validated by Intelligence against the tool's published `outputSchema`;
- the **post-state snapshot**: the `NormalizedEntitySnapshot` the governed write already builds from its read partner after a real write (contract-schema shape, `parents` included);
- the dry-run `expectedPostState` the approval was granted on.

Intelligence validates the snapshot against `@cesteral/contract-schema` and writes `executionResult` and `action_outcomes.expected_post_state` / the read-back. The existing drift check and reconciliation UI then work unchanged. A digest alone can't serve them. A missing outcome is handled by the strand rules above.

### B5. URL-less clients

The connector creates the approval for every client, URL-capable or not. A client without `elicitation.url` gets `Unauthorized` with the approval link and the instruction "approve, then run the same request again". The re-run is a fresh call that attaches to the open row (B2 / A6), finds `approved`, and claims it (B3). So the resume path is the same tool call, with no new tool and no Inngest. Until approval the re-run returns the same message; there's no server wait, because these clients can't take an `input_required`.

### B6. Connector-side changes (this repo)

- **Factory round at the token check**, offered when all of these hold:
  - mode `enforce`;
  - verdict `MISSING_TOKEN`, `EXPIRED` or `REPLAYED_JTI`;
  - a `jwt`-mode principal;
  - `GOVERNANCE_APPROVAL_API_BASE` is set.

  A signature or hash mismatch stays a hard reject.

- **Reuse the #244 machinery.** `ConfirmationPayload` gains `apr` (approval id), `sid` (submission id) and `r` (round). Add `clientCanElicitUrl()` beside `clientCanElicit`.
- **No double confirmation.** When the token carries `approvalId`, `elicitInput` skips the in-client checkbox, because the approval page already showed the full context.
- **The dispatch hook** (B3 step 3) and the outcome call (B4).
- **Stdio and self-host** have no Cloud Run identity, so they don't take part.
- **Tests:**
  - a wire test on both eras;
  - a changed-args retry gets `-32602`;
  - re-claim before dispatch;
  - no re-dispatch after the marker;
  - a URL-less re-run attaches and claims.

## Confirmation audit (connector, independent)

`confirmDestructive` logs only refusals today. Emit one `governance-audit` record per decision:

- `event: "destructive_confirmation"`;
- action, outcome (accepted, declined or cancelled), tool, args digest, principal tag;
- the `jti` / `approvalId` when a token was present.

The `MCP_ELICIT_DESTRUCTIVE=skip` bypass gets a record too; today it leaves no trace. This needs nothing from Intelligence.

## Problems in cesteral-intelligence found while designing this

Read on `origin/main` `00c9afa4`. Nothing was run.

1. **`approvalId` is dropped on approved execution.** Confirmed by inspection. `governanceFromPermit` (`external-governance.ts:288-303`) returns no `approval`, though `DecisionPermit` carries `approvalId` (`decision-permit.ts:70-71`). The mint (`:1302-1307`), the unattested-write warning (`:1186`) and the audit (`:1553`) all read `governance.approval?.id`, so it is `undefined` there.
2. **No `kid` and no previous secret on the mint side.** `mintGovernanceDecisionToken` sets no `kid`. `GOVERNANCE_DECISION_TOKEN_SECRET_PREVIOUS` is read nowhere in `lib/` or `app/`, and the asset resolver verifies the current secret only, so a secret rotation can't overlap.
3. **The `executed` write can fail silently.** `updateApprovalResult`'s `{success: false}` is ignored at `execute-approved-action.ts:662`, and a failed `action_outcomes` insert is only logged (`:771`). A5 works around it; the row can still be `executing` with a result lost.
4. **`docs/architecture/approval-lifecycle.md` is stale.** It says there is no `executing` or `executed` status.

## Client support: the main risk

The spec is clear, but Claude Code's URL-mode support looks unreliable according to user bug reports (2026), not an Anthropic statement:

- [#88075](https://claudeissues.com/issue/88075-bug-claude-code-v2-1-237-does-not-advertise-url-mode-elicitation-on-mcp-2026-07): v2.1.237 sends `elicitation: {}` with no `url` on the 2026-07-28 handshake.
- [#69555](https://claudeissues.com/issue/69555-bug-url-mode-elicitation-broken-client-capability-dropped-from-form-url-to-2-1-1): the capability was narrowed to `{}`.
- [#35353](https://claudeissues.com/issue/35353-bug-vscode-extension-silently-declines-mcp-url-elicitation-requests): the VS Code extension declines URL requests without showing them.

Anthropic's 2026-11-24 announcement calls elicitation GA without naming modes. Before building:

- [ ] Probe Claude (web, Desktop, Code CLI, VS Code) on 2026-07-28. Record:
  - the declared `elicitation` modes;
  - whether a URL request is shown;
  - how fast and how often the client re-issues after `accept`, which decides `W` and `R`;
  - whether a manual "retry" control exists.
- [ ] Without URL support, only the parked-text changes ship (the link and resume instruction in A1, re-entry in A6). The round waits per client.

## Rollout

1. Client probe. Confirmation audit.
2. Gateway 2026-07-28 support (A1), behind a flag.
3. Phase A round + URL fixture (A4 gate), tested end to end in Claude on one tenant.
4. Fix Intelligence problems 1–3.
5. Decide whether direct connector writes are supported. If yes, build Phase B behind `GOVERNANCE_APPROVAL_ROUND=on` on one server and one `enforce` contract. If no, refuse `mcp:write` on direct connector tokens under `enforce`.
6. Update `governance-runtime.md` and `confirmation-mrtr.md` here, and `governance-decision-token.md` and `approval-lifecycle.md` there.

## Open questions

- In topology B, could Intelligence run the dry-run itself (does it hold the platform credentials), or does it trust the connector's?
- `W`, `R` and the state TTL are placeholders until the probe measures real client retry behaviour.
- Should the Tasks extension (`io.modelcontextprotocol/tasks`, also GA in Claude) replace the bounded wait for clients that declare it? A task survives a long human step without burning rounds, but the gateway would then implement `tasks/get`, `tasks/update` and `tasks/cancel` as well.
- Should `warn` mode offer the round as an optional "approve now", to collect approvals before `enforce`?
- Bulk tools: one approval per call (one `actionHash`), or split per entity through `change_set_approvals`?

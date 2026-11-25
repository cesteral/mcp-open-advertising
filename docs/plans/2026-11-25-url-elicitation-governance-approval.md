# Governance Approval over URL-Mode Elicitation (design)

**Status:** draft, revision 4 (2026-11-25), addressing the three reviews on #408. It spans this repo and cesteral-intelligence. Nothing is built. Intelligence references point at its `origin/main` `00c9afa4`.

**Goal:** someone in an end-user MCP client (Claude, Claude Code) takes a governed write that needs approval, approves it in the browser, and gets the result in the same conversation. The decision token never passes through the client or the model. Intelligence's approval model (roles, maker-checker, tiers, personal-workspace rules) is reused, not duplicated.

## Two topologies, two gaps

|                         | **A. Through the Intelligence gateway** (`/api/mcp`)                                                                                                                                                                        | **B. Directly to a connector**                                                                                                         |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Auth                    | Intelligence API key or OAuth. Per-request principal is `MCPAuthResult` (`lib/features/mcp/auth/middleware.ts:31-55`)                                                                                                       | Intelligence-issued ES256 access JWT (`lib/features/mcp/auth/jwt.ts`, #246 option A): `sub` = user, `org_id`, `client_id`, `mcp:write` |
| Decision token          | Intelligence mints it in-process for its own outbound call (`external-governance.ts:1302-1314`)                                                                                                                             | **Unobtainable.** Under `enforce` every governed write fails with `MISSING_TOKEN` (`tool-handler-factory.ts:1091`)                     |
| When approval is needed | Returns `isError: true` text `{status: "approval_required", approvalId, …}` (`governed-outcome.ts:75-83, 211-219`). The agent is told to poll `get_approval_status`. Inngest `execute-approved-action` runs the write later | Not reachable                                                                                                                          |

The connector's in-client confirmation (`elicitation-helpers.ts`, 51 call sites) is a form checkbox, and no audit records its answer.

## Order of work

1. **Confirmation audit (connector, ships on its own).** See "Confirmation audit" below.
2. **Phase A (Intelligence gateway only).** A read-only resume path on top of the existing approval page and Inngest execution. It needs two Intelligence prerequisites first: a durable result save (A5) and atomic attach (A6).
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

Every retry carrying a `requestState`, and every `resume_approved_action` call (A6), is authorized against the approval row, not just the state. The state's MAC must verify first. Then all of the following must hold, otherwise wire `-32602` "Invalid or expired requestState":

- **Requester:** `row.requestedBy === auth.userId`. For API keys, `userId = apiKey.userId ?? apiKey.createdByUserId` (`middleware.ts:148`).
- **Credential:**
  - OAuth: `row.requestedByAgentKind === "oauth_client"` and `row.requestedByAgentId === auth.clientId`. Binding the client id, not the access token, lets a refreshed token resume.
  - API key: `row.requestedByAgentKind === "api_key"` and `row.requestedByAgentId === auth.tokenId`. A key revoked in between fails authentication before this check.
- **Workspace:** `row.ownerId` / `ownerType` equal the request's `orgId`, or the `userId` for a personal workspace.
- **Tool call** (retries only; `resume_approved_action` takes no write arguments): `row.actionName === params.name`, and the executable-args digest of this retry's `arguments` equals both the sealed `a` and the row's frozen `executable_action_hash` (the executable projection, not `writeArgsHash`; see A6 for the column).

An **expired but authentic** state (MAC valid, `exp` passed, and the checks above pass against the row) is not an error. It gets the manual-resume result (A4) naming the approval id. `-32602` is only for a bad MAC, a failed binding check, or changed arguments.

### A4. Staying resumable while the browser is open

The constraints:

- The client answers consent with `{action: "accept"}` the moment the user agrees to open the link. That says nothing about completion.
- The TS SDK client re-issues automatically, up to `inputRequired.maxRounds` (default 10), and fails with `InputRequiredRoundsExceeded` after that.
- Re-sending the same prompt on every retry would burn those rounds in seconds.

So the gateway waits on the server, within a bound, and caps the rounds itself:

- **Wait.** On a retry whose `inputResponses` accepts this approval's prompt, the handler polls the row (indexed read by id, every 2 s) for up to `W` seconds. The 2026-07-28 spec allows a server to block until the request is fulfilled.
  - `W` = 240 s, with `/api/mcp` given an explicit `export const maxDuration = 300`. The route sets none today, and the project default isn't stated in the repo.
  - The poll keeps going while the row is **open** (`pending`, `approved`, `executing`). It ends early when the row becomes **terminal** (`executed`, `rejected`, `expired`, `timed_out`, `abandoned`, `superseded`).
- **Re-ask.** If the row is still open after `W`, the gateway returns `input_required` again with the same URL, and the message says the approval is still open. `r` increments.
- **Round cap.** After `R` = 3 rounds (about 12 minutes of waiting) the gateway stops asking and returns the manual-resume result.
- **Manual resume.** The result is not an error. Its text says the approval is still open and links it. It tells the agent to call `resume_approved_action` with this `approvalId` (A6), and **not** to call the write tool again. The same instruction replaces "poll `get_approval_status`" in today's parked response for clients without URL support.

| Row status (on first poll or at the end of a wait) | Gateway answer                                                                                                                                                                                                                                                               |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pending`                                          | Open: keep waiting. At `W`: re-ask (`r < R`) or manual resume                                                                                                                                                                                                                |
| `approved` (queued for Inngest, not yet claimed)   | Open: keep waiting. Never a final "running" result. At `W`: as `pending`                                                                                                                                                                                                     |
| `executing`                                        | Open: keep waiting. At `W`: as `pending`                                                                                                                                                                                                                                     |
| `executed`                                         | Inspect `executionResult` (A5)                                                                                                                                                                                                                                               |
| `rejected`                                         | Tool error: "Rejected by {role} at {time}"                                                                                                                                                                                                                                   |
| `expired`, `timed_out`, `abandoned`, `superseded`  | Tool error naming the status. `superseded` names the replacement approval id                                                                                                                                                                                                 |
| Client answers `decline`                           | Tool error: "You chose not to open the approval. Approval {id} stays pending: another approver can still approve it, and it will then run server-side." The row is **not** rejected, because declining to open a link is not a rejection and the row may be routed to others |
| Client answers `cancel`                            | Same as `decline`, shorter message                                                                                                                                                                                                                                           |
| Authentic state expired (A3), or round cap reached | Manual-resume result (above)                                                                                                                                                                                                                                                 |

**Rollout gate.** The dbm-mcp conformance fixtures exercise form elicitation only. Phase A needs a URL fixture on the gateway's test harness that drives the whole loop:

1. 2026 client, URL capability.
2. Assert the `input_required` shape and the sealed state.
3. A headless browser opens the link, signs in a test user, and approves.
4. Inngest is stubbed to `executed`.
5. Assert the final result is delivered on the waiting retry.

Add cases for:

- decline and cancel;
- timeout → re-ask → manual resume → `resume_approved_action`;
- `approved` while queued;
- Inngest finishing **before** the caller resumes (resume returns the terminal row; no second approval);
- two simultaneous first calls (one approval);
- an expired authentic state (manual resume, not `-32602`);
- a changed-args retry (`-32602`);
- a failed result save followed by recovery, with exactly one dispatch (A5).

Phase A does not ship to a client until the probe (see "Client support") shows that client declares and renders URL mode.

### A5. What a resume returns

`execute-approved-action` sets `status = executed` with `executionResult` in one UPDATE (`approval/mutations.ts:2095-2101`) whatever the outcome. The caller ignores that UPDATE's return value (`execute-approved-action.ts:662`), and it writes `action_outcomes` afterwards in a try/catch that only logs (`:704, :771`). So `executed` can mean success, failure or unknown, and the outcome row may never exist. **Resume reads `executionResult` only, never `action_outcomes`.**

**Prerequisite: the result must be saved durably (Intelligence, before any Phase A rollout).** `updateApprovalResult` catches its own error and returns `{success: false}`, and the caller ignores it. When the save fails, the write has landed but the row stays `executing` with `execution_result` NULL and `dispatch_attempts ≥ 1`. The rest of `store-result` still runs, and the strand reconciler later lists the row as outcome unknown even though the result was in hand (`stranded-claim.ts:40-47`). Every resume in that window would wait and then report unknown for a write that succeeded. The fix:

- Move the save into its own Inngest step, `persist-result`, between `execute-tool` and the rest of `store-result`. It throws when `updateApprovalResult` returns `{success: false}`.
- Inngest retries only that step. `execute-tool`'s output is memoized, so a retry re-saves the same `executionResult` and never re-dispatches. `persist-result` holds only the UPDATE, so retrying it duplicates nothing (`recordOutcome`, the booking and notifications stay in later steps).
- If every retry fails, `onFailure` (`recoverFailedApprovedExecution`) sees `dispatchAttempts ≥ 1` and settles outcome unknown, as today. The worst case is an honest "unknown", never a row stuck in `executing`.
- Test: make the first `updateApprovalResult` fail, then assert the row ends `executed` with the result, `dispatchAttempts === 1`, and one call to the connector.

| `executionResult`                                                                                     | Resume answer                                                                                       |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Missing on an `executed` row                                                                          | Tool error: outcome unknown (treat as unknown)                                                      |
| Row `executing`, `dispatchAttempts ≥ 1`, past `APPROVAL_OUTCOME_UNKNOWN_AFTER_MINUTES` with no result | Tool error: outcome unknown, the same rule as the strand reconciler. It is not an open row any more |
| `success: true`, no `responseContractViolation`                                                       | The connector's result (below)                                                                      |
| `success: true` with `responseContractViolation`                                                      | Tool error: "Executed, but the platform response failed validation. See change {id}." No content    |
| `success: false`, no `outcomeUnknown`                                                                 | Tool error with `error` (and `executionRejected` when present): "Did not run" or "Failed"           |
| `outcomeUnknown: true`                                                                                | Tool error: "The write may or may not have landed. Do not retry; check change {id}."                |

**Disclosure.** `get_approval_status` withholds connector content on purpose. It returns content only to the requester, and only for first-party tools (`change-sets.ts:521-535`), because a connector's answer is third-party text. Resume returns the connector's `content` because it is the answer to the requester's own `tools/call`. An unparked call would have returned the same text to the same caller, and A3 proves the caller is that requester, credential, workspace and call. It carries the same untrusted-content marking the gateway applies to a direct connector result. `get_approval_status` keeps its rule. Resume is a separate, narrower path.

### A6. Resume handle, re-entry and duplicates

**Manual resume goes through an explicit approval id, never a repeat of the write.** The gateway adds one tool, `resume_approved_action({approvalId})`:

- `readOnlyHint: true`. It never enters admission, preview or governance, and never mints or dispatches anything.
- It resolves the row in **any** status. An open row gets the bounded wait (A4, no elicitation: it is a read). A terminal row gets the A5 answer at once. So "Inngest finished before the caller came back" just returns the result.
- It is authorized by A3 against the row: requester, credential, workspace. An id that doesn't exist and an id the caller isn't bound to get the same "not found", so the tool can't be used to probe whether an approval exists.
- `approvalId` is the non-secret id agents already receive (`approval-reference.ts`).

**Re-entry is a guard, not the resume path.** Some agents will repeat the write anyway. A fresh `tools/call` for the write is matched on an **attach key**:

`attach_key = H(ownerType, ownerId, requestedBy, requestedByAgentKind, requestedByAgentId, __mcpConnectionId, toolName, executable_action_hash)`

- **Open row with that key:** attach to it and return its approval-required answer (the URL round on a URL-capable client). No second row, no second change set, no second notification. This is the reuse path `mintApproval` already has.
- **Terminal `executed` row with that key, settled within the last 15 minutes:** don't enter governance. Return that row's A5 answer read-only, with "this exact change already ran at {time} (approval {id})". A deliberate second application of the same change inside that window needs a person in the app.
- **Otherwise:** a new request, through governance as today.

**Atomic first calls.** Nothing on `origin/main` makes this atomic. `workflow_approvals` has no credential, connection or `executable_action_hash` column (the connection travels in `action_input.__mcpConnectionId`). Its only unique indexes are `approval_token` and the pending-replacement slot. The `policy_decision_logs.executable_action_hash` index is write-once but not unique. So Phase A adds:

- a column `workflow_approvals.attach_key`, computed in the creation path before `mintApproval`. That means computing `executable_action_hash` there too: today `recordExecutableActionHash` runs only at Step 6, just before dispatch (`external-governance.ts:1381`).
- a partial unique index `uq_workflow_approvals_open_attach_key ON (attach_key) WHERE status IN ('pending','approved','executing')`.
- `createActionApproval` inserting with `ON CONFLICT (attach_key) WHERE … DO NOTHING RETURNING id`. On conflict it reads the existing open row and takes the reuse path. `mintApproval` must create the change set and notification only for the row that won the insert. Two simultaneous first calls therefore produce one approval.

**The guard is serialized against settlement.** The partial index stops two _open_ rows, but it doesn't cover the 15-minute guard. A call can check, find no recently executed row, and then the existing row settles to `executed`. That row leaves the index, and the call's insert creates a second approval. So the guard and the transition into `executed` take the same lock:

- **Creation** runs the guard read (open row? recent `executed` row?) and the `createActionApproval` insert in one transaction holding `pg_advisory_xact_lock(hashtextextended('approval-attach:' || attach_key, 0))`. This is the same pattern as the `budget-booking` lock (`outcomes/mutations.ts:366`).
- **Settlement:** the transaction that moves a row into `executed` (`persist-result`, A5, and the Phase B settlement, B4) takes the same lock for that row's `attach_key` and stamps `settled_at` in the same UPDATE.
- **Other terminal statuses** (`rejected`, `expired`, `timed_out`, `abandoned`, `superseded`) don't take the lock. After them a new approval is correct: the earlier change never ran.

Whichever transaction takes the lock first decides the call:

- the call first: it sees the open row and attaches;
- settlement first: the call sees the fresh `executed` row and gets its result.

Neither order produces a second approval. Test both orders by holding the settlement transaction open across an identical call arriving during `executing → executed`. Assert one approval and the correct answer each time.

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

Phase B reuses A2–A7: the round, the bounded wait, the round cap, the status mapping, the resume handle, the attach key and the page. What changes is who executes the write. The connector does, not Inngest, so the governance work Inngest does today has to move into Intelligence endpoints the connector calls. Those endpoints call the **same functions**, not copies.

**Precondition:** a direct-access token must resolve to exactly one Intelligence MCP connection (`mcp_connections` row), for example through a connection claim on the access JWT or `allowedConnectionIds` of length 1. Creation runs Intelligence's own preview against that connection. If a direct token can't name its connection, Phase B is out of scope and the fallback in "Order of work" applies.

### B1. Authenticating creation, claim, dispatch and outcome

Every call carries two credentials, in the shape of an RFC 8693 token exchange:

- **Actor: the workload.** A Google ID token from the connector's Cloud Run service account. `verify-deployment-identity.ts` pins `aud` to the connector's own endpoint origin (`:93-120`), so it can't be reused as-is. Add a verifier with `aud` = the Intelligence endpoint origin (new `GOVERNANCE_APPROVAL_API_AUDIENCE`), the same Google issuer check and the same fleet SA allowlist. The SA email names the connector service.
- **Subject: the user's delegated grant.** The connector forwards the Intelligence-issued access JWT the client presented. Intelligence verifies it with its own key (`iss`, `aud` ∈ `MCP_JWT_AUDIENCES` and equal to the calling connector's audience, `exp`, `scope` ⊇ `mcp:write`). It derives `userId`, `org_id`, `client_id` and the connection from the token, never from the body. The token is evidence of the grant, not a credential for calling Intelligence as the user.

The row records the binding: `requestedBy` = `sub`; `requestedByAgentKind: "oauth_client"`, `requestedByAgentId` = `client_id`; owner = `org_id`; the connection; the connector service; `executionMode: "connector_retry"`; and the A6 `attach_key`. Every later call checks its own subject and actor tokens against that binding. A refreshed access JWT for the same `sub`, `client_id`, `org_id` and connection is accepted.

### B2. Creation runs the existing admission path

`POST /api/connector/approvals {submissionId, toolName, executableArgs}` is a new entry into the same funnel the gateway uses (`admitAndExecuteExternalWrite`, `funnel.ts:171`). It runs in **approval-only mode**: it stops at Step 5 and never dispatches. The steps it must run, in order, are the existing ones:

1. `admitWriteTool` (`admit.ts:253`): the tool must be admitted for this connection, which pins the `definitionHash` from the cached tool row. Effect-class writes (`admitEffectWriteTool`) are out of scope for Phase B, as they are for decision tokens.
2. `checkCallCapabilityAdmittance` (`funnel.ts:343`).
3. `executeWritePreview` (`preview-pipeline.ts:200`), run **by Intelligence** through its `MCPClient` against the connection: read partner → preState, dry run + `validateStructuredResponse(dry_run)`, `expectedPostState`, `diffSnapshots`. The connector posts no preview; the frozen preview is Intelligence's own.
4. `logActionExecution(admissionDecisionRow(...))` (`funnel.ts:475`).
5. `buildApprovedPayload` (`approved-payload.ts:100`): freezes `writeArgsHash`, `dispatchedCapability`, `dryRunResultHash`, `toolDefinitionHash`.
6. `withGovernance` → `runGovernance` → `recordOrRefuse`. This is the full kernel walk. `block` is a tool error. `allow` is left out of the pilot (below).
7. On `require_approval`: `mintApproval` (`governance-steps.ts:418`) with the attach-key insert from A6. That stores `dryRunResult.writePreview` (`:545`), creates the change set, records escalation, links it and notifies.
8. `recordExecutableActionHash` with the connector-projection `actionHash`, moved here from Step 6. It becomes the A6 attach key input and is what the token will bind.

Creation is idempotent on `submissionId` across **all** statuses (unique index), so a retry of the same submission returns the same approval whatever happened to it. A different submission with the same attach key attaches to an open row, or hits the 15-minute guard (A6).

**`allow` in the pilot.** Claim needs an `approved` row, and creation makes one only on `require_approval`, so an `allow` has no durable execution record to claim. The pilot therefore doesn't execute `allow` directly:

- Creation records the admission decision row (step 4) and the kernel decision, as for any decision.
- It creates no approval row, mints no token, and returns the tool error `allowed_not_in_pilot`: "Policy allows this write without approval, but direct execution of an allowed write isn't in the pilot yet. Send it through the Cesteral gateway."

After the pilot, the durable record for `allow` should be the one the gateway already uses for auto-cleared writes: the ledger Change (`claimForDispatch`, `external-write-ledger.ts:157`; unique `change_sets.ledger_key = attempt:<attempt_key>`), with `attempt_key` = `submissionId`. The B3 claim, dispatch and outcome fences would then sit on that Change instead of an approval row. That needs its own design pass.

### B3. Claim, dispatch and outcome are fenced to one claim

The existing helpers don't give this as-is:

- `claimApprovalExecution` allows re-entry only by the run that owns the claim (`mutations.ts:1933-1943`).
- `beginApprovalDispatch` increments `dispatchAttempts` on **every** entry (`:2020-2032`; only `attempt === 1` means a first send).

Phase B therefore adds fenced transitions, each a single conditional UPDATE. A call that matches zero rows is refused.

**The claim has an identity before it is sent.** The connector mints a `claimRequestId` (128-bit random) before its first `POST …/claim`, and resends the same request with the same id if the HTTP call fails within the tool call. Intelligence stores it on the row (`execution_claim_request_id`). Recovery then never depends on the `claimRunId`, which exists only in a response that may be lost.

| Call                    | Condition (all in the `WHERE`)                                                                                                                                                | Effect                                                                                                                                                   |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **claim** (first)       | `status = 'approved'`, not past the execution deadline, binding matches                                                                                                       | `status = 'executing'`, new `executionClaimRunId`, `execution_claim_request_id = :claimRequestId`, `executionClaimedAt = now()`                          |
| **claim, same request** | `status = 'executing'`, `execution_claim_request_id = :claimRequestId`, `dispatchAttempts = 0`, `executionResult IS NULL`, binding matches                                    | Nothing changes. Returns the **same** `claimRunId` and a freshly minted token                                                                            |
| **claim takeover**      | `status = 'executing'`, `execution_claim_request_id <> :claimRequestId`, `dispatchAttempts = 0`, `executionResult IS NULL`, `executionClaimedAt < now() - L`, binding matches | New `executionClaimRunId`, the new `claimRequestId`, `executionClaimedAt = now()`. The old claim is dead: its `/dispatch` and `/outcome` match zero rows |
| **dispatch**            | `status = 'executing'`, `executionClaimRunId = :claim`, `dispatchAttempts = 0`                                                                                                | `dispatchAttempts = 1`, `dispatchAttemptedAt = now()`, `dispatchDeadlineAt = now() + D`                                                                  |
| **outcome**             | `status = 'executing'`, `executionClaimRunId = :claim`, `executionResult IS NULL`                                                                                             | Accept the result (B4)                                                                                                                                   |

A claim with a different `claimRequestId` inside the lease `L` (placeholder 60 s), or after dispatch, gets `executing` (open: wait or re-ask per A4). That covers a new tool call after a lost response, and a URL-less resume that has only the approval id: both just wait out the lease, then take over. The binding (B1) and the pre-dispatch fence (`dispatchAttempts = 0`) are the safety conditions. The lease only stops two live connectors racing each other.

What the connector does:

1. `POST …/claim {claimRequestId}`. Intelligence runs the existing pre-execution steps of `execute-approved-action`, in its order, through a shared `prepareApprovedExecution(approval)` extracted from the Inngest function:
   - the expiry check;
   - `check-connection-sign-in`;
   - the person's-own-campaign-change holds (`check-requester-access`, `check-before-value`);
   - `classify-approved-call` / `decideApprovedToolBinding`;
   - `runAsyncPreClaimGovernance`: pause, `evaluateGovernance`, the budget re-check, approval drift. A re-gate files a replacement approval, and the connector answers with the new id;
   - the claim transition above;
   - `advanceLinkedChangeSetForExecution(id, "start")`;
   - PRE-1 (`checkApprovedPayloadArgsBinding` against the **frozen** `action_input`), PRE-2a and PRE-2b (`checkApprovedPayloadToolDefinitionBinding`), PRE-3 (a fresh `executeWritePreview` compared with the frozen one).

   It mints a 120 s token with `approvalId` and returns `{token, claimRunId, toolName, executableArgs}`. The connector executes the frozen args it gets back, never args from the client.

2. The connector verifies the token (`verifyDecisionToken`, consuming the `jti`) and runs the tool up to its first platform write. In-tool confirmations and field elicitation all come before the first write (#244 audit).
3. `POST …/dispatch {claimRunId}` from a new factory hook, "before first upstream write". **The connector sends only if this call returns 200.** A refusal stops the call before any write.
4. `POST …/outcome` (B4), from the same claim.

**Initial rollout: no resend, ever.** Once `dispatchAttempts = 1`, that row is never dispatched again, not even with an idempotency key. The Inngest path's one keyed resend (`execute-approved-action-dispatch.ts:150`) is not carried over. Revisit after rollout if needed.

Recovery:

| Situation                                                                                                  | Answer                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claim response lost, within the same tool call                                                             | The connector resends with the same `claimRequestId` and gets the same `claimRunId` and a fresh token                                                                                                                                                                        |
| Claim response lost and the tool call ended; token expired; or an in-tool `input_required` before dispatch | The next call (a retry, or the B5 resume by approval id) waits out the lease `L`, then takes over with its own `claimRequestId`. The connector also seals `claimRequestId` into its `requestState`, so a retry that carries the state resumes the same claim without waiting |
| A retry finds `dispatchAttemptedAt` set, now < `dispatchDeadlineAt`, no result                             | Report `executing` (open: wait or re-ask per A4). Never re-claim, never re-dispatch                                                                                                                                                                                          |
| Now ≥ `dispatchDeadlineAt` and no result                                                                   | Accept an `outcomeUnknown` result through the **same** accept transaction as a real outcome (B4). Whoever reads it first does this, or the strand reconciler                                                                                                                 |
| `executing`, `dispatchAttempts = 0`, past the claim lease with no re-claim                                 | The strand reconciler's never-sent ending applies unchanged (`endNeverSentApprovals`: approval `abandoned`, change `failed`)                                                                                                                                                 |
| `outcome` posted twice by the winning claim with the same body                                             | Idempotent: `202` with the current `settlement_state` and the steps done so far (B4). Bodies are compared by digest; a different body gets `409`. `200` only once `settlement_state = 'done'`                                                                                |
| `outcome` from a dead claim                                                                                | 409, nothing changes                                                                                                                                                                                                                                                         |
| `outcome` from the winning claim after the deadline already settled unknown                                | Stored as late evidence on the outcome row and shown in reconciliation. The settlement stays `outcome_unknown` until a person resolves it                                                                                                                                    |

`execute-approved-action` skips `executionMode: "connector_retry"` rows, so Inngest and the connector can never both dispatch.

### B4. Settlement runs the existing executor steps

`POST …/outcome {claimRunId, status, structuredContent?, error?}`, where `status` is one of:

- `succeeded`;
- `failed_before_dispatch` (only valid while `dispatchAttempts = 0`; settles like the never-sent ending);
- `failed`;
- `unknown` (sent, no answer).

Settlement has two parts: a synchronous **accept**, which records the result once, and a durable **continuation**, which finishes every side effect idempotently. Both come from code extracted out of `store-result` and the steps after it, so the Inngest executor and the connector path run the same functions.

**Accept, in `/outcome`.** Accept is steps 1–3 below, then one transaction that:

- holds the A6 attach-key lock;
- runs the `outcome` fence (`executionResult IS NULL` for the winning claim);
- writes `executionResult` (validation, reconciliation and classification included), `status = 'executed'`, `settled_at` and `settlement_state = 'pending'`;
- inserts an outbox event, `approval/settle {approvalId}`, through the same outbox the approve route already uses.

The response is `202 {settlement_state}`. A failure anywhere before the commit leaves nothing written, and the connector retries the same body.

**Continuation: the Inngest function `settle-approved-execution`.** It is fed by the outbox event, and the strand reconciler re-emits it for any row stuck at `settlement_state = 'pending'`. It runs steps 5–8 as separate Inngest steps. Each step is guarded by a row in `approval_settlement_steps (approval_id, step)` with a unique key, written in the same transaction as the step's effect, so a retried or re-emitted run skips steps that are done. Where the effect already has its own guard, that guard is used: the `budget-booking` advisory lock plus `setBookingAccrualState`, the change-set projector's CAS, and a notification dedupe key of `approvalId`. `recordOutcome` needs one added: a unique `action_outcomes.approval_id`. When the last step is done, `settlement_state = 'done'`.

**Timeout against a real outcome.** The deadline path (B3 recovery) and `/outcome` both go through the same accept transaction, under the same lock and the same `executionResult IS NULL` fence. Whichever commits first defines the settlement:

- A real outcome that loses to the timeout is kept as late evidence (B3).
- A timeout that loses to a real outcome matches zero rows and does nothing.

The continuation only ever sees the winner.

**Test:** fail the run immediately after the accept commit, and again after each continuation step. Assert:

- the booking happens exactly once, and the change is settled exactly once;
- a duplicate `/outcome` reports `202 pending`, then `200 done`;
- the strand reconciler's re-emit finishes a run whose event was lost.

The same continuation replaces the tail of Inngest's `store-result` (A5's `persist-result` is its accept), so both executors have one settlement path.

Steps:

1. Validate the posted execute response: `validateStructuredResponse` in execute mode, which requires `structuredContent.after` and parses it as a `NormalizedEntitySnapshot` (`structured-response.ts:305-337`). Then `upsertValidationAccuracy` and `checkApprovedPayloadCapabilityBinding` (`dispatchedCapability`). A failure is a `responseContractViolation`, as on the Inngest path.
2. Reconcile with `reconcileForApproval` → `reconcileWriteOutcome`:
   - **expected** = the preview frozen at approval time, `approval.dryRunResult.writePreview.expectedPostState` (`approvedPayload` holds only its hash);
   - **actual** = `resultAfter` from the validated response (`actualPostStateSource: "server_returned_after"`, `reconcile-outcome.ts:216, 277`);
   - plus `maybeRunIndependentReadAudit` where it applies today.

   A digest of the response can't feed this, so the connector posts the full validated `structuredContent`.

3. `classifyExecutionSettlement` → verified, failed or unknown.
4. Accept: the transaction above (`persist-result` on the Inngest path).
5. _Continuation from here._ `recordOutcome`, including the spend booking. `buildApprovedSpendBooking` books only on `succeeded`; `recordBudgetBooking` runs under its advisory lock, then `trackBudgetSpend` settles reservations and the actor-scoped daily envelope.
6. `logActionExecution` (audit), `dispatchNotification` (owner), `updateAdjustmentStatus`.
7. `advanceLinkedChangeSetForExecution(id, settlement)`. On `failed`, `releaseReservations`; an unknown outcome keeps its hold until the TTL.
8. Reconciliation telemetry.

### B5. URL-less clients resume by approval id

The connector creates the approval for every client, URL-capable or not. A client without `elicitation.url` gets `Unauthorized` carrying the approval link and "approve it, then call `{platform}_resume_approved_write` with approvalId {id}; do not repeat the write".

`{platform}_resume_approved_write({approvalId})` is a fleet-wide tool registered by a shared factory, like `*_search_tools`. It takes **no write arguments**, but it can cause a platform mutation, so it is **classified as a write**:

- **Hints:** `readOnlyHint: false`, `destructiveHint: true` (it may run any approved write, deletes included), `idempotentHint: false`, `openWorldHint: true`. It gets an entry in `tool-hint-rules.mjs`.
- **Connector scope:** `requiredScopeForTool` (`packages/shared/src/auth/tool-scopes.ts`) maps any tool that isn't `readOnlyHint: true` to `mcp:write`, so the transport answers `403 insufficient_scope` to a read-only token before the tool runs.
- **Intelligence scope:** the claim endpoint checks the subject token's `scope` ⊇ `mcp:write` (B1). Both checks apply.
- The gateway's `resume_approved_action` (A6) stays `readOnlyHint: true`. It only reads, and Inngest executes.

- **Open, approved row bound to this caller:** it claims (B3), receives the frozen tool name and args, and executes those.
- **Terminal row:** it returns the A5 answer, read from Intelligence (`GET …/approvals/{id}` with the B1 credentials).
- **Unknown or unbound id:** "not found".

URL-capable clients that hit the A4 round cap get the same tool. A repeat of the write itself gets the A6 attach-key guard, never a second approval. Adding the tool moves every server's tool list and needs a `tool-definition-hashes` sync, a hint-rule classification (`tool-hint-rules.mjs`) and a wire test.

### B6. Connector-side changes (this repo)

- **Factory round at the token check**, offered when all of these hold:
  - mode `enforce`;
  - verdict `MISSING_TOKEN`, `EXPIRED` or `REPLAYED_JTI`;
  - a `jwt`-mode principal;
  - `GOVERNANCE_APPROVAL_API_BASE` is set.

  A signature or hash mismatch stays a hard reject.

- **Reuse the #244 machinery.** `ConfirmationPayload` gains `apr` (approval id), `sid` (submission id), `crq` (the claim request id, B3) and `r` (round). Add `clientCanElicitUrl()` beside `clientCanElicit`.
- **The "before first upstream write" hook** for `/dispatch`. A refusal aborts with no write. This sits next to the existing upstream-write recorder in `tool-handler-factory.ts`.
- **The outcome call** with the tool's full `structuredContent`.
- **No double confirmation.** When the token carries `approvalId`, `elicitInput` skips the in-client checkbox.
- **The resume tool** (B5).
- **Stdio and self-host** have no Cloud Run identity, so they don't take part.
- **Tests:**
  - wire tests on both eras;
  - a changed-args retry gets `-32602`;
  - a committed claim whose response is dropped: same `claimRequestId` → same `claimRunId`; a new request within `L` → `executing`; after `L` → takeover, and the old claim's `/dispatch` refused;
  - a dead claim's `/dispatch` refused, and no write;
  - a retry inside the dispatch window reports `executing`;
  - settle unknown after the deadline;
  - a duplicate `/outcome` is idempotent (`202` while pending, `200` once done);
  - a failure right after the accept commit, finished by the continuation with one booking;
  - a timeout and a real outcome racing for the same row;
  - `allow` returns `allowed_not_in_pilot` and creates no row;
  - a read-only token calling `{platform}_resume_approved_write` gets `403 insufficient_scope`;
  - a URL-less resume by approval id executes the frozen args.

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
3. **A failed result save leaves a landed write looking unsent.** `updateApprovalResult`'s `{success: false}` is ignored (`execute-approved-action.ts:662`). The row stays `executing` with no result, and the strand reconciler reports outcome unknown for a write whose result was in hand. A failed `action_outcomes` insert is also only logged (`:771`). The fix is in A5 and is a **Phase A prerequisite**.
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
- [ ] Without URL support, only the parked-text changes, `resume_approved_action` and the attach key ship. The round waits per client.

## Rollout

1. Client probe. Confirmation audit (connector).
2. **Prerequisites in Intelligence:**
   - durable result save (A5) with its failed-save test;
   - the `attach_key` column, its partial unique index, and the atomic insert in `createActionApproval` (A6);
   - problem 1 fixed.
3. Gateway 2026-07-28 support (A1) and `resume_approved_action`, behind a flag.
4. Phase A round and URL fixture (the A4 gate), tested end to end in Claude on one tenant.
5. Problem 2 fixed (needed before any secret rotation).
6. Decide whether direct connector writes are supported.
   - If yes:
     1. Extract `prepareApprovedExecution` and `settleApprovedExecution` from the Inngest function, with no behaviour change, and make Inngest call them.
     2. Build Phase B behind `GOVERNANCE_APPROVAL_ROUND=on` on one server and one `enforce` contract.
   - If no: refuse `mcp:write` on direct connector tokens under `enforce`.
7. Update `governance-runtime.md` and `confirmation-mrtr.md` here, and `governance-decision-token.md` and `approval-lifecycle.md` there.

## Open questions

- How does a direct-access token name its connection (the Phase B precondition)? A new claim on the access JWT, or `allowedConnectionIds`?
- `W`, `R`, the state TTL, the 15-minute duplicate window and the dispatch deadline `D` are placeholders until the probe and one real write measure them.
- Should the Tasks extension (`io.modelcontextprotocol/tasks`, also GA in Claude) replace the bounded wait for clients that declare it? A task survives a long human step without burning rounds, but the gateway would then implement `tasks/get`, `tasks/update` and `tasks/cancel` as well.
- Should `warn` mode offer the round as an optional "approve now", to collect approvals before `enforce`?
- Bulk tools: one approval per call (one `actionHash`), or split per entity through `change_set_approvals`?

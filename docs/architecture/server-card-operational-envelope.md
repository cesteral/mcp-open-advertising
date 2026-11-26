# Server Card Operational Envelope

Reference for this subsystem. [CLAUDE.md](../../CLAUDE.md) keeps a short summary and links here.

The card's `operational` block (#201) answers what a client needs before pointing a server at a live ad account: rate limit, retry semantics, which duplicate-write rails are covered, what is recorded, and what cannot be undone. `packages/shared/src/utils/transport/operational-envelope.ts` builds it.

**Everything mechanical is derived, not declared.** The rate limit is read off the live `RateLimiter` the transport was handed (`describeLimits()`); the retry policy comes from `describeRetryPolicy()`, which _executes_ the server's own `isRetryable` predicate over representative statuses and reads the live `IDEMPOTENT_RETRY_METHODS` set. A declared copy in `registry.json` was rejected for exactly the drift it would introduce — the fleet is not uniform here:

| Server           | Divergence                                                         | Why a fleet-wide declaration would lie                                                                               |
| ---------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `amazon-dsp-mcp` | `maxRetries: 2`, and `isAmazonDspRetryable` deliberately omits 429 | Publishes 3 total attempts, and `resendSafeForAllMethods: []` — with 429 not retryable, no status is POST-safe there |
| `dbm-mcp`        | Drives its own report-polling loop, never `executeWithRetry`       | Publishes `retry: null` rather than defaults describing code it does not run                                         |

`pinterest-mcp` used to be listed here for a media-upload POST that opted into 5xx retry via `retryNonIdempotent`. That opt-in lived in `postMultipart`, which nothing called, so the row described code that never ran; the dead method was removed and pinterest now follows the default method rule.

**"POST is never retried" is false and must not be reinstated.** `isMethodSafeToResend` returns `true` for 429 regardless of method — a 429 means the platform rejected the request _without processing it_, so re-sending is safe. The exclusion is for the ambiguous 5xx, which can arrive after the platform committed the write. `operational-envelope.test.ts` asserts the note never makes the flat claim.

**Two fields exist to state an ABSENT protection.** `idempotency.clientRetryDeduplicated: false` — a caller that loses the response, re-authorizes and re-issues `tools/call` carries a new `jti`, so `consumeOnce` returns `"fresh"` and the write can duplicate; that is the normal recovery path and nothing here prevents it. `rollback.supported: false` — there is no undo. A block publishing only the protections would read as "duplicate writes are handled". They are not.

**`rollback.terminalOperations` is the one hand-authored value**, because irreversibility is a per-platform fact no local code states. It lives in `registry.json` per server and reaches the card via `registry-data.generated.ts` → `buildServerCardExtras`. Beside it, `operational.terminalStatusValues` lists the status values that are one-way on the platform; it is not published on the card, but the tools read it to decide when a status change is confirmed as irreversible ([confirmation-mrtr.md](confirmation-mrtr.md#coverage-every-irreversible-path-is-confirmed-as-irreversible)). It is ratcheted by `scripts/lib/terminal-operations.test.mjs`, which boots each server and requires every destructive tool to be declared terminal or listed in `reversible-operations-allowlist.json` with a reason.

**The ratchet keys on tool NAME _and_ annotation**, deliberately. Seven of the fleet's sixteen destructive tools declare `operation: ["bulk_job"]` or `["manage"]` rather than `delete` — `tiktok`/`pinterest`/`snapchat`/`msads`/`amazon_dsp` `_delete_entity` are `writeClass: "effect"` bulk deletes governed as one batch effect, which is correct for governance and useless for identifying destructiveness. An annotation-only rule would have silently exempted the tools that delete the most at once; the mutation test for this pairing is in the #201 PR.

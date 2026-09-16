// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * The operational envelope this fleet publishes on its server card (#201).
 *
 * A client deciding whether it is safe to point a server at a live ad account
 * needs to know, before the first call: how hard we will hit their quota, what
 * we re-send after an ambiguous failure, whether a duplicate write is possible,
 * whether anything is recorded, and whether anything can be undone. Identity,
 * auth and provenance were already on the card. None of this was.
 *
 * WHAT THIS IS NOT
 *
 * This block is a description of behaviour, not a guarantee of it, and two of
 * its fields exist specifically to say that a protection a client might assume
 * is ABSENT:
 *
 *   - `idempotency.clientRetryDeduplicated: false` — a caller that loses our
 *     response, re-authorizes, and re-issues `tools/call` can still duplicate a
 *     write. Nothing in this fleet prevents that.
 *   - `rollback.supported: false` — there is no undo. Some operations are
 *     terminal, and `rollback.terminalOperations` names them.
 *
 * A block that published only the protections would be worse than no block,
 * because "we thought about duplicate writes" reads as "duplicate writes are
 * handled". They are not.
 *
 * ANTI-DRIFT
 *
 * Every mechanical value here is DERIVED from the thing it describes, not
 * declared alongside it:
 *
 *   - retry semantics come from `describeRetryPolicy()`, which probes the real
 *     predicate and reads the live `IDEMPOTENT_RETRY_METHODS` set;
 *   - the rate limit is read off the live `RateLimiter` the transport was handed.
 *
 * Only `rollback.terminalOperations` is hand-authored, because irreversibility
 * is a per-platform fact no local code states (DV360's delete is a hard delete;
 * Amazon DSP has no hard delete at all). That list is the one thing here that
 * CAN drift, so it is ratcheted by a test rather than trusted.
 */

import type { RateLimiter } from "./rate-limiter.js";
import { describeRetryPolicy, type ObservedRetryPolicy } from "./retryable-fetch.js";

/** How this server's rate limiting actually behaves. */
export interface OperationalRateLimit {
  /** Sliding-window cap, read from the live limiter. */
  requestsPerMinute: number;
  /** Always `per-process` in this fleet — see `note`. */
  scope: "per-process";
  note: string;
}

/** What a client should expect us to re-send, and how often. */
export interface OperationalRetry extends ObservedRetryPolicy {
  note: string;
}

/**
 * Duplicate-write protection, stated as four independent booleans rather than
 * one summary flag. The layers protect different rails and a client that
 * collapses them will over-trust the weakest one.
 */
export interface OperationalIdempotency {
  /** Does any platform client here honor a caller-supplied idempotency key? */
  clientSuppliedKeySupported: boolean;
  /** Is an ambiguous re-send inside ONE tool call prevented? */
  transportRetryDeduplicated: boolean;
  /** Is replaying the SAME decision token rejected? */
  decisionReplayBlocked: boolean;
  /** Is a client re-issuing `tools/call` under a NEW authorization deduplicated? */
  clientRetryDeduplicated: boolean;
  /** Is a partially-completed bulk write resumable without re-issuing successes? */
  bulkPartialCompletionResumable: boolean;
  note: string;
}

/** What is recorded, and for how long. */
export interface OperationalAudit {
  /** Every tool invocation is captured by `InteractionLogger`. */
  toolCalls: boolean;
  /** Governed writes additionally produce governance audit records. */
  governedWrites: boolean;
  /** Where tool-call records are written, from `INTERACTION_LOG_MODE`. */
  destination: string;
  /**
   * Deliberately `null` rather than omitted: "no retention period is currently
   * guaranteed" is a more useful answer than silence, and it makes the gap a
   * tracked decision instead of an oversight.
   */
  retentionDays: number | null;
  note: string;
}

/** A tool operation that cannot be undone on this platform. */
export interface TerminalOperation {
  /** The advertised tool name. */
  tool: string;
  /**
   * The canonical `cesteral` write operations that are terminal on this
   * platform. A tool may be terminal for `delete` but reversible otherwise.
   */
  operations: string[];
  /** Why it is terminal, in terms an operator can act on. */
  note: string;
}

/** Whether anything can be undone. Currently: no. */
export interface OperationalRollback {
  supported: boolean;
  terminalOperations: TerminalOperation[];
  note: string;
}

export interface OperationalEnvelope {
  rateLimit: OperationalRateLimit | null;
  /**
   * `null` when this server does not route through the shared retry layer, so
   * no policy can be observed from it. `dbm-mcp` is the live case: it drives
   * its own report-polling loop instead of `executeWithRetry`. Publishing the
   * shared defaults for such a server would be a confident description of code
   * it does not run — a null a client can see is better than a plausible wrong
   * number it cannot.
   */
  retry: OperationalRetry | null;
  idempotency: OperationalIdempotency;
  audit: OperationalAudit;
  rollback: OperationalRollback;
}

/**
 * Fleet-wide duplicate-write posture.
 *
 * Single-sourced because it is a property of the shared transport and governance
 * layers, not of any one platform — and because the prose has to stay precise.
 * The wording below is deliberately NOT "POST is never retried", which is the
 * natural shorthand and is false: `isMethodSafeToResend` returns true for 429
 * regardless of method, because a 429 means the platform rejected the request
 * without processing it. The dangerous case is the ambiguous 5xx, and that is
 * the one excluded.
 */
export const FLEET_IDEMPOTENCY: OperationalIdempotency = {
  clientSuppliedKeySupported: false,
  transportRetryDeduplicated: true,
  decisionReplayBlocked: true,
  clientRetryDeduplicated: false,
  bulkPartialCompletionResumable: false,
  note:
    "Duplicate protection is PARTIAL. Inside one tool call, a non-idempotent method is not " +
    "re-sent after an ambiguous 5xx (a 5xx can arrive after the platform committed the write); " +
    "it IS re-sent after a 429, which the platform rejected without processing. Replaying the " +
    "same decision token is rejected by jti. Neither covers a client that loses the response, " +
    "obtains a FRESH authorization, and re-issues tools/call — that carries a new jti and can " +
    "still duplicate the write, and it is the normal recovery path. No platform client here " +
    "honors a client-supplied idempotency key, and a partially-completed bulk write has no " +
    "per-item key or checkpoint, so it cannot be resumed without re-issuing items that succeeded.",
};

const RATE_LIMIT_NOTE =
  "Per-process sliding window. Under multi-instance autoscaling the effective fleet limit is " +
  "this value times the instance count; server defaults assume ~10 instances. Treat it as a " +
  "per-instance floor, not a fleet-wide guarantee.";

const RETRY_NOTE =
  "Observed by probing this server's own retry predicate and method guard, not declared. " +
  "`resendSafeForAllMethods` lists statuses re-sent for ANY method including POST; every other " +
  "retryable status is re-sent only for `resendSafeMethodsOn5xx`. Individual endpoints may opt a " +
  "POST into 5xx retry where a re-send is provably inert.";

const ROLLBACK_NOTE =
  "There is no undo surface. `terminalOperations` names operations whose effect cannot be " +
  "reversed through this server by any subsequent call — including archival, which is itself " +
  "irreversible on some platforms. Absence from this list is not a promise of reversibility.";

export interface OperationalEnvelopeInput {
  /** The live limiter the transport was handed. Omitted when the server has none. */
  rateLimiter?: RateLimiter;
  /** The server's error-class override, if its HTTP client has one. */
  isRetryable?: (status: number, errorBody: string) => boolean;
  /** The server's retry budget (`RetryConfig.maxRetries`). */
  maxRetries?: number;
  /**
   * Set false for a server that does not route through `executeWithRetry`.
   * Suppresses the retry block entirely rather than reporting defaults it does
   * not use.
   */
  usesSharedRetryLayer?: boolean;
  /** Resolved `INTERACTION_LOG_MODE`. */
  interactionLogMode: string;
  /** This server's terminal operations, from the registry. */
  terminalOperations: TerminalOperation[];
}

/**
 * Read the per-minute cap out of a live limiter.
 *
 * Servers configure exactly one wildcard pattern (`createPlatformRateLimiter`),
 * so the common case is a single entry. If a server ever configures several,
 * publishing the MOST RESTRICTIVE is the honest choice — it is the one a client
 * pacing itself will actually hit first.
 */
function readRequestsPerMinute(rateLimiter: RateLimiter): number | null {
  const perMinute = rateLimiter
    .describeLimits()
    .filter((entry) => entry.windowMs > 0)
    .map((entry) => (entry.limit * 60_000) / entry.windowMs);
  if (perMinute.length === 0) return null;
  return Math.min(...perMinute);
}

export function buildOperationalEnvelope(input: OperationalEnvelopeInput): OperationalEnvelope {
  const requestsPerMinute = input.rateLimiter ? readRequestsPerMinute(input.rateLimiter) : null;

  return {
    rateLimit:
      requestsPerMinute === null
        ? null
        : { requestsPerMinute, scope: "per-process", note: RATE_LIMIT_NOTE },
    retry:
      input.usesSharedRetryLayer === false
        ? null
        : { ...describeRetryPolicy(input.isRetryable, input.maxRetries), note: RETRY_NOTE },
    idempotency: FLEET_IDEMPOTENCY,
    audit: {
      toolCalls: true,
      governedWrites: true,
      destination: input.interactionLogMode,
      retentionDays: null,
      note:
        "Tool calls and failures are recorded, with the upstream HTTP trail on failure. No " +
        "retention period is currently guaranteed for audit records; the 24h GCS lifecycle rule " +
        "covers spilled report bodies only, which are not audit records.",
    },
    rollback: {
      supported: false,
      terminalOperations: input.terminalOperations,
      note: ROLLBACK_NOTE,
    },
  };
}

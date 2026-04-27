// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { McpError, JsonRpcErrorCode } from "./mcp-errors.js";

/**
 * Thrown when {@link pollUntilComplete} exhausts its configured
 * `maxAttempts` budget without observing a terminal state.
 */
export class ReportTimeoutError extends McpError {
  constructor(attempts: number) {
    super(JsonRpcErrorCode.InternalError, `Report polling exceeded ${attempts} attempts`);
    this.name = "ReportTimeoutError";
  }
}

/**
 * Thrown when {@link pollUntilComplete} observes a failed status as
 * reported by the caller's `isFailed` predicate. The original status
 * object is preserved on the error's `status` field, and a string
 * representation is included in `McpError.data` for transport.
 */
export class ReportFailedError<T = unknown> extends McpError {
  readonly status: T;
  constructor(status: T, message = "Report generation failed") {
    super(JsonRpcErrorCode.InternalError, message, {
      status: String(status),
    });
    this.name = "ReportFailedError";
    this.status = status;
  }
}

/**
 * Thrown when {@link pollUntilComplete} is cancelled via its
 * `AbortSignal` — either before the first fetch (signal already
 * aborted) or while sleeping between attempts.
 */
export class ReportAbortedError extends McpError {
  constructor(message = "Report polling aborted") {
    super(JsonRpcErrorCode.InternalError, message);
    this.name = "ReportAbortedError";
  }
}

/**
 * Configuration for {@link pollUntilComplete}.
 *
 * Defaults:
 * - `initialDelayMs`: 2000
 * - `maxDelayMs`: 30000
 * - `maxAttempts`: 60
 * - `backoffFactor`: 1.5
 * - `isFailed`: none (only `isComplete` is required to terminate successfully)
 * - `signal`: none
 */
export interface PollOptions<T> {
  /** Fetches the current status from the upstream system on each attempt. */
  fetchStatus: () => Promise<T>;
  /** Returns true when the status represents successful completion. */
  isComplete: (status: T) => boolean;
  /** Optional predicate that, when true, terminates polling with {@link ReportFailedError}. */
  isFailed?: (status: T) => boolean;
  /** Delay before the second attempt, in ms. Default 2000. */
  initialDelayMs?: number;
  /** Upper bound on the exponentially backed-off delay, in ms. Default 30000. */
  maxDelayMs?: number;
  /** Maximum number of `fetchStatus` invocations before throwing {@link ReportTimeoutError}. Default 60. */
  maxAttempts?: number;
  /** Multiplier applied to the delay after each attempt. Default 1.5. */
  backoffFactor?: number;
  /** Optional AbortSignal for cancellation. Aborting rejects with {@link ReportAbortedError}. */
  signal?: AbortSignal;
}

/**
 * Poll an async job until it completes, fails, or exceeds a time/attempt
 * budget. Used by reporting tools that submit a job and must wait for a
 * downloadable result.
 *
 * Behavior:
 * - Calls `fetchStatus` up to `maxAttempts` times.
 * - Between attempts, sleeps with exponential backoff capped at `maxDelayMs`.
 * - Throws {@link ReportFailedError} as soon as `isFailed` returns true.
 * - Throws {@link ReportTimeoutError} if no terminal state is observed
 *   within `maxAttempts`.
 * - Throws {@link ReportAbortedError} if the optional `signal` is aborted
 *   before the first fetch or while sleeping.
 *
 * See {@link PollOptions} for defaults.
 */
export async function pollUntilComplete<T>(opts: PollOptions<T>): Promise<T> {
  const {
    fetchStatus,
    isComplete,
    isFailed,
    initialDelayMs = 2000,
    maxDelayMs = 30000,
    maxAttempts = 60,
    backoffFactor = 1.5,
    signal,
  } = opts;

  let delay = initialDelayMs;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal?.aborted) throw new ReportAbortedError();
    const status = await fetchStatus();
    if (isFailed?.(status)) throw new ReportFailedError(status);
    if (isComplete(status)) return status;
    if (attempt === maxAttempts) break;
    await sleep(delay, signal);
    delay = Math.min(Math.round(delay * backoffFactor), maxDelayMs);
  }
  throw new ReportTimeoutError(maxAttempts);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(new ReportAbortedError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Which failures of a Bid Manager report run are worth another attempt.
 *
 * The report loop used to retry *every* error — a 400 invalid query, a
 * 401/403, a reversed date range — five times with a 60 s cooldown, re-sending
 * the POST `queries.create` / `queries.run` each time, and then replaced the
 * real cause with a Timeout-coded "retry attempts exhausted". Only failures
 * that another attempt can plausibly fix are retried now, and only in a way
 * that cannot duplicate a write the platform may already have committed:
 *
 * | Failure                                   | Retried | Why                                                              |
 * | ----------------------------------------- | ------- | ---------------------------------------------------------------- |
 * | Report still QUEUED/RUNNING (poll budget) | yes     | Next attempt resumes polling the SAME report — no POST re-sent   |
 * | Report state FAILED                       | yes     | Definitive failure, so re-running the query is not a duplicate   |
 * | Local rate limiter refused                | yes     | The request never left the process                               |
 * | Upstream 429 (any method)                 | yes     | Rejected without being processed, so re-sending is safe          |
 * | Status poll (GET): 5xx / network error    | yes     | Idempotent read                                                  |
 * | create/run (POST): 5xx / network error    | **no**  | Ambiguous — the platform may have committed it                   |
 * | Any other 4xx, validation, missing path   | **no**  | Cannot succeed on retry; the original error is surfaced as-is    |
 */

import { JsonRpcErrorCode, McpError, ReportTimeoutError, ReportingError } from "@cesteral/shared";
import {
  QueryCreationError,
  QueryExecutionError,
  ReportGenerationError,
  upstreamHttpStatus,
} from "../../utils/errors/bid-manager-errors.js";

export interface RetryDecision {
  retryable: boolean;
  reason: string;
}

const NETWORK_ERROR_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ECONNABORTED",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EPIPE",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "UND_ERR_SOCKET",
  "UND_ERR_CONNECT_TIMEOUT",
]);

/** True for a transport-level failure with no HTTP response (gaxios/Node error codes). */
export function isNetworkError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && NETWORK_ERROR_CODES.has(code)) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

export function classifyReportError(error: unknown): RetryDecision {
  if (error instanceof ReportTimeoutError) {
    return { retryable: true, reason: "report still running; resume polling the same report" };
  }
  if (error instanceof ReportGenerationError) {
    return { retryable: true, reason: "report FAILED; re-run the query" };
  }
  if (error instanceof McpError && error.code === JsonRpcErrorCode.RateLimited) {
    return { retryable: true, reason: "rate limited before the request was processed" };
  }
  if (error instanceof QueryCreationError || error instanceof QueryExecutionError) {
    if (upstreamHttpStatus(error) === 429) {
      return { retryable: true, reason: "upstream 429: request was not processed" };
    }
    return {
      retryable: false,
      reason: "non-idempotent POST failed; re-sending could duplicate a committed write",
    };
  }
  if (error instanceof ReportingError) {
    return error.retryable
      ? { retryable: true, reason: "transient report-status read failure" }
      : { retryable: false, reason: "report-status read failed permanently" };
  }
  return { retryable: false, reason: "not a transient failure" };
}

// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Worst-case wall time of one Bid Manager report run, derived from the same
 * config values `BidManagerService` polls and retries with.
 *
 * Anything that has to outlive a run — the MCP task TTL of
 * `dbm_run_custom_query_async` in particular — is sized from this rather than
 * from a hand-picked constant, so raising `REPORT_POLL_MAX_RETRIES` or
 * `REPORT_QUERY_RETRIES` cannot silently leave a TTL shorter than the run.
 */

import type { AppConfig } from "../../config/index.js";

export type ReportTimingConfig = Pick<
  AppConfig,
  | "reportPollInitialDelayMs"
  | "reportPollMaxDelayMs"
  | "reportPollMaxRetries"
  | "reportQueryRetries"
  | "reportRetryCooldownMs"
>;

/** Backoff multiplier `pollForCompletion` uses when the caller passes none. */
export const REPORT_POLL_BACKOFF_MULTIPLIER = 2;

/**
 * Sum of every sleep in the worst case: each attempt waits the initial delay,
 * then sleeps between `reportPollMaxRetries` status fetches with capped
 * exponential backoff (mirroring `pollUntilComplete`); attempts are separated
 * by the retry cooldown. Excludes HTTP latency — callers add headroom.
 */
export function computeWorstCaseReportDurationMs(config: ReportTimingConfig): number {
  const initial = config.reportPollInitialDelayMs;
  const maxDelay = config.reportPollMaxDelayMs;
  const pollAttempts = Math.max(1, config.reportPollMaxRetries);
  const queryAttempts = Math.max(1, config.reportQueryRetries);

  let perAttempt = initial; // pollForCompletion sleeps once before the first fetch
  let delay = initial;
  for (let i = 1; i < pollAttempts; i++) {
    perAttempt += delay;
    delay = Math.min(Math.round(delay * REPORT_POLL_BACKOFF_MULTIPLIER), maxDelay);
  }

  return queryAttempts * perAttempt + (queryAttempts - 1) * config.reportRetryCooldownMs;
}

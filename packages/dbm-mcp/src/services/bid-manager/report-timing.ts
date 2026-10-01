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

/**
 * Default wall-time cap on one synchronous Bid Manager report run, in ms.
 *
 * Without it, a synchronous tool call could sit in the create → run → poll →
 * retry loop for about 72 minutes with the default poll and retry settings
 * (fleet review 2026-09, dbm #2). The hosted deploy cannot answer that call
 * anyway: `terraform/modules/mcp-service/main.tf` sets no `timeout` on the
 * Cloud Run service template, so the platform default applies.
 *
 * basis: Cloud Run Admin API v1 discovery document
 * (https://run.googleapis.com/$discovery/rest?version=v1, revision 20260925),
 * `RevisionSpec.timeoutSeconds`: "TimeoutSeconds holds the max duration the
 * instance is allowed for responding to a request. Cloud Run: defaults to 300
 * seconds (5 minutes)."
 *
 * 240 s stops waiting before that 300 s, leaving a minute for the CSV
 * download, the saved-query delete and the response, so the caller gets a
 * Timeout error naming the cause instead of a severed connection.
 * `REPORT_SYNC_MAX_WALL_TIME_MS` overrides it (a self-hosted or stdio server
 * whose client waits longer can raise it); `dbm_run_custom_query_async` is the
 * path for runs that need longer.
 */
export const DEFAULT_REPORT_SYNC_MAX_WALL_TIME_MS = 240_000;

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

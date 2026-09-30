// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Shared helpers for the TTD GraphQL bulk-job tools (`createQueryBulk`,
 * `createMutationBulk`, `bulkJob`, `cancelBulkJob`).
 *
 * Provenance — TTD's GraphQL hosts and doc pages are unreachable from this
 * repo's egress, so everything here is taken from TTD's own published code:
 *
 * - `thetradedesk/ttd-workflows-python` (commit cd4e64c, 2026-04-24),
 *   `src/ttd_workflows/models/bulkjobstatus.py:7-13` — the bulk-job status enum
 *   has exactly six members: Queued, InProgress, PartialSuccess, Failure,
 *   Success, Cancelled. `graphqlbulkjob.py:20` says that model "mirrors the GQL
 *   bulkjob". Its wire values are the Workflows REST facade's PascalCase.
 * - `thetradedesk/platform` (commit adff1a6, 2025-06-23), e.g.
 *   `Python/FirstPartyData/GetAdvertiserFirstPartyDataBatchedGQL.py:158-185` —
 *   polls GraphQL `bulkJob(id:) { id status url gqlErrors }` and keeps polling
 *   only while `status == 'QUEUED' or status == 'IN_PROGRESS'`. So GraphQL
 *   returns SCREAMING_SNAKE spellings, and every other status is terminal.
 *   `GetAllThirdPartyDataForPartnerWithCallbackGQL.py:154` only retrieves a
 *   result for `Success` / `PartialSuccess`.
 *
 * The GraphQL spellings of the other four statuses (SUCCESS, PARTIAL_SUCCESS,
 * FAILURE, CANCELLED) are inferred from that convention, not observed, so
 * classification is spelling-insensitive: `PartialSuccess` and
 * `PARTIAL_SUCCESS` classify identically.
 */

export type BulkJobOutcome =
  | "queued"
  | "in_progress"
  | "success"
  | "partial_success"
  | "failure"
  | "cancelled"
  | "unrecognized";

export const BULK_JOB_OUTCOMES = [
  "queued",
  "in_progress",
  "success",
  "partial_success",
  "failure",
  "cancelled",
  "unrecognized",
] as const satisfies readonly BulkJobOutcome[];

const OUTCOME_BY_NORMALIZED_STATUS: Record<string, BulkJobOutcome> = {
  QUEUED: "queued",
  INPROGRESS: "in_progress",
  SUCCESS: "success",
  PARTIALSUCCESS: "partial_success",
  FAILURE: "failure",
  CANCELLED: "cancelled",
};

/** Uppercase and drop separators, so `IN_PROGRESS`, `InProgress` and `in-progress` compare equal. */
function normalizeStatus(status: string): string {
  return status.toUpperCase().replace(/[^A-Z]/g, "");
}

export interface BulkJobStatusClassification {
  outcome: BulkJobOutcome;
  /**
   * True for every status except QUEUED / IN_PROGRESS. This is the exact rule
   * TTD's own samples poll with, so an unrecognized status is terminal too
   * (reported as `unrecognized` rather than guessed into a known bucket).
   */
  terminal: boolean;
}

export function classifyBulkJobStatus(
  status: string | undefined | null
): BulkJobStatusClassification {
  const outcome =
    typeof status === "string"
      ? (OUTCOME_BY_NORMALIZED_STATUS[normalizeStatus(status)] ?? "unrecognized")
      : "unrecognized";
  return { outcome, terminal: outcome !== "queued" && outcome !== "in_progress" };
}

/**
 * Normalize `bulkJob.gqlErrors` to a string array. TTD's samples select it as a
 * leaf and print it; the Workflows mirror types it `List[str]`. Anything else is
 * JSON-stringified rather than dropped.
 */
export function normalizeGqlErrors(value: unknown): string[] | undefined {
  if (value === null || value === undefined) return undefined;
  const entries = Array.isArray(value) ? value : [value];
  const out = entries
    .filter((e) => e !== null && e !== undefined && e !== "")
    .map((e) => (typeof e === "string" ? e : JSON.stringify(e)));
  return out.length > 0 ? out : undefined;
}

/**
 * Error selection for bulk-job mutation payloads.
 *
 * `... on MutationError { field message }` is how TTD's samples read
 * `createQueryBulk` payload errors (platform
 * `Python/FirstPartyData/GetAdvertiserFirstPartyDataBatchedGQL.py:105-114`),
 * and how this package's live-tested MyReports mutations read theirs
 * (`create-template-schedule.tool.ts`). `__typename` stays so an error of any
 * other type is still reported by name.
 */
export const MUTATION_ERROR_SELECTION = `errors {
      __typename
      ... on MutationError {
        field
        message
      }
    }`;

/**
 * `createQueryBulk` additionally returns `BulkJobQueryValidationError` with
 * `queryErrors` (same TTD sample, lines 110-114).
 */
export const QUERY_BULK_ERROR_SELECTION = `errors {
      __typename
      ... on MutationError {
        field
        message
      }
      ... on BulkJobQueryValidationError {
        field
        message
        queryErrors
      }
    }`;

/** Render payload errors (`{ __typename, field, message, queryErrors }`) as one line each. */
export function describePayloadErrors(errors: unknown[]): string {
  return errors
    .map((raw) => {
      if (raw === null || typeof raw !== "object") return String(raw);
      const e = raw as Record<string, unknown>;
      const message =
        typeof e.message === "string" && e.message.length > 0
          ? e.message
          : typeof e.__typename === "string"
            ? e.__typename
            : JSON.stringify(e);
      const field = Array.isArray(e.field)
        ? e.field.join(".")
        : typeof e.field === "string"
          ? e.field
          : undefined;
      const parts = [field ? `${message} (field: ${field})` : message];
      if (e.queryErrors !== undefined && e.queryErrors !== null) {
        parts.push(`queryErrors: ${JSON.stringify(e.queryErrors)}`);
      }
      return parts.join(" — ");
    })
    .join("; ");
}

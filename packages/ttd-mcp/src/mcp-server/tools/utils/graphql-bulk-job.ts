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

import { isTtdProductionUrl } from "../../../config/sandbox-guard.js";

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

/**
 * `ttd_graphql_mutation_bulk` input cap. TTD's documented limit is said to be
 * 1000, but nothing about `createMutationBulk` is confirmed (#231): no TTD
 * source this repo can reach shows the operation, its input type or how an
 * entry binds to the mutation's variables. A job is not cancellable once
 * submitted, so the cap bounds how many writes one unverified call can start.
 */
export const MAX_MUTATION_BULK_INPUTS = 100;

/** TTD's documented bulk mutation-string limit, in GraphQL lexical tokens. */
export const MAX_BULK_MUTATION_TOKENS = 15_000;

/** Operator opt-in for running `ttd_graphql_mutation_bulk` against production. */
export const MUTATION_BULK_PRODUCTION_OPT_IN = "TTD_ALLOW_UNVERIFIED_MUTATION_BULK";

/**
 * Why `ttd_graphql_mutation_bulk` must not run against `graphqlUrl`, or
 * undefined when it may.
 *
 * TTD's published code (the `thetradedesk/platform` samples and the Workflows
 * SDKs for Python, Go and Java) documents `createQueryBulk(input: { query,
 * bulkJobCallback })` and polls `bulkJob`, but never `createMutationBulk`. Its
 * bulk-write sample uses a different flow entirely (`fileUpload`, then
 * `bulkCreateCampaigns(input: { advertiserId, fileId })`, then `jobProgress`).
 * So the operation this tool submits has never been confirmed, and it can
 * start up to MAX_MUTATION_BULK_INPUTS writes that cannot be cancelled.
 *
 * It runs against the sandbox, or any non-TTD host (a local mock), freely.
 * Against production it runs only when the operator sets
 * TTD_ALLOW_UNVERIFIED_MUTATION_BULK=true. The check keys on the endpoint the
 * session actually calls, so a sandbox flag with a production override (which
 * the config guard already refuses) cannot slip through.
 */
export function mutationBulkProductionRefusal(
  graphqlUrl: string,
  env: NodeJS.ProcessEnv = process.env
): string | undefined {
  if (env[MUTATION_BULK_PRODUCTION_OPT_IN] === "true") return undefined;
  if (!URL.canParse(graphqlUrl)) {
    return `ttd_graphql_mutation_bulk refused: the GraphQL endpoint (${String(graphqlUrl)}) is not a URL, so it cannot be confirmed as the sandbox.`;
  }
  if (!isTtdProductionUrl(graphqlUrl)) return undefined;
  return (
    "ttd_graphql_mutation_bulk is disabled against production TTD. The createMutationBulk " +
    "operation it submits is not shown in any TTD source this server can check, and a " +
    "submitted job cannot be cancelled (#231). Run it against the sandbox " +
    "(TTD_USE_SANDBOX=true) to verify it first, or have the operator set " +
    `${MUTATION_BULK_PRODUCTION_OPT_IN}=true to allow it in production. For writes today, ` +
    "use ttd_graphql_query with a single mutation, or the per-entity REST tools " +
    "(ttd_bulk_update_entities, ttd_bulk_manage_bid_lists)."
  );
}

const GRAPHQL_PUNCTUATORS = new Set([
  "!",
  "$",
  "&",
  "(",
  ")",
  ":",
  "=",
  "@",
  "[",
  "]",
  "{",
  "|",
  "}",
]);
const NAME_START = /[_A-Za-z]/;
const NAME_CONTINUE = /[_0-9A-Za-z]/;
const NUMBER = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/;

/**
 * Count lexical tokens as the GraphQL spec (October 2021, section 2.1) defines
 * them: punctuators (`...` is one), names, numbers and strings (block strings
 * included) each count once; whitespace, line terminators, commas and comments
 * are ignored. A character the lexer does not recognise counts as one token,
 * so a malformed document is never undercounted.
 *
 * This replaces a 60,000-character proxy for the 15,000-token limit that was
 * not conservative: punctuators are one character each, so 60k characters can
 * hold far more than 15k tokens.
 */
export function countGraphqlLexicalTokens(source: string): number {
  let count = 0;
  let i = 0;
  const n = source.length;
  while (i < n) {
    const ch = source[i];
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r" || ch === "," || ch === "\uFEFF") {
      i++;
      continue;
    }
    if (ch === "#") {
      while (i < n && source[i] !== "\n" && source[i] !== "\r") i++;
      continue;
    }
    count++;
    if (source.startsWith("...", i)) {
      i += 3;
    } else if (GRAPHQL_PUNCTUATORS.has(ch)) {
      i++;
    } else if (NAME_START.test(ch)) {
      i++;
      while (i < n && NAME_CONTINUE.test(source[i])) i++;
    } else if (source.startsWith('"""', i)) {
      i += 3;
      while (i < n && !source.startsWith('"""', i)) {
        i += source.startsWith('\\"""', i) ? 4 : 1;
      }
      i += 3;
    } else if (ch === '"') {
      i++;
      while (i < n && source[i] !== '"' && source[i] !== "\n") {
        i += source[i] === "\\" ? 2 : 1;
      }
      i++;
    } else {
      const number = NUMBER.exec(source.slice(i, i + 64));
      i += number ? number[0].length : 1;
    }
  }
  return count;
}

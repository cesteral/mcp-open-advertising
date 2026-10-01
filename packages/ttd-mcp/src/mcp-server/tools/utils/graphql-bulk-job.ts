// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Shared helpers for the TTD GraphQL bulk-job tools (`createQueryBulk`,
 * `createMutationBulk`, `bulkJob`, `cancelBulkJob`).
 *
 * Provenance. The contract is TTD's own "Bulk operations" page
 * (https://open.thetradedesk.com/advertiser/docsApp/Foundations/resources/doc/GqlBulkOperations,
 * read 2026-10-01; a public page whose code samples are Monaco editors, so read
 * them from the editor models, not the page text). It documents:
 *
 * - `createMutationBulk(input: { mutation, mutationVariables })`, where
 *   `mutation` is ONE mutation operation and `mutationVariables` is an array of
 *   JSON-encoded strings, one per execution, each keyed by the mutation's
 *   variable name (`"{ \"input\": { \"campaignId\": ... } }"`); at most 1000
 *   entries and fewer than 15,000 lexical tokens in the mutation; only
 *   advertiser, campaign and ad group entities;
 * - mutation jobs cannot be cancelled (`cancelBulkJob` is for query jobs);
 * - at most 10 active and 20 queued jobs; the result file expires one hour
 *   after `completedAt`; results and errors are merged into one file;
 * - the poll `bulkJob(id: 123) { id createdAt rawResult completionPercentage
 *   completedAt status url runtimeErrors ... on BulkMutationJob {
 *   mutationGqlErrors { error index } } ... on BulkQueryJob { queryGqlErrors } }`,
 *   so per-input errors of a mutation job arrive as `mutationGqlErrors`, each
 *   with the failed input's `index`;
 * - statuses SUCCESS, PARTIAL_SUCCESS and FAILURE by name.
 *
 * Earlier versions of this file, written while the page was unreachable, took
 * the poll fields from TTD's `thetradedesk/platform` samples (`gqlErrors`) and
 * the status enum from `thetradedesk/ttd-workflows-python`
 * (`bulkjobstatus.py:7-13`: Queued, InProgress, PartialSuccess, Failure,
 * Success, Cancelled; samples poll while `status == 'QUEUED' or 'IN_PROGRESS'`).
 * The status spellings QUEUED, IN_PROGRESS and CANCELLED still come only from
 * those, so classification is spelling-insensitive: `PartialSuccess` and
 * `PARTIAL_SUCCESS` classify identically.
 *
 * Still unconfirmed against a live TTD: that this server's requests are
 * accepted as written (nothing here has run against TTD), and the exact GraphQL
 * type of the `mutationVariables` variable (the page's example never declares it).
 */

import { McpError, JsonRpcErrorCode } from "@cesteral/shared";
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
 * Normalize a leaf error field of `bulkJob` (`runtimeErrors`, `queryGqlErrors`)
 * to a string array. TTD's page selects them as leaves without showing their
 * type, so a string, a list, or an object is accepted; anything other than a
 * string is JSON-stringified rather than dropped.
 */
export function normalizeGqlErrors(value: unknown): string[] | undefined {
  if (value === null || value === undefined) return undefined;
  const entries = Array.isArray(value) ? value : [value];
  const out = entries
    .filter((e) => e !== null && e !== undefined && e !== "")
    .map((e) => (typeof e === "string" ? e : JSON.stringify(e)));
  return out.length > 0 ? out : undefined;
}

/** One per-input failure of a bulk mutation job: TTD's `{ error, index }`. */
export interface MutationGqlError {
  error: string;
  /** Position of the failed input in the submitted `mutationVariables`, when TTD gives it. */
  index?: number;
}

/**
 * Normalize `bulkJob { ... on BulkMutationJob { mutationGqlErrors { error index } } }`.
 * `index` is the position of the failed input. An entry that is not an object
 * is kept as its text rather than dropped.
 */
export function normalizeMutationGqlErrors(value: unknown): MutationGqlError[] | undefined {
  if (value === null || value === undefined) return undefined;
  const entries = Array.isArray(value) ? value : [value];
  const out: MutationGqlError[] = [];
  for (const raw of entries) {
    if (raw === null || raw === undefined || raw === "") continue;
    if (typeof raw !== "object") {
      out.push({ error: String(raw) });
      continue;
    }
    const e = raw as Record<string, unknown>;
    const error =
      typeof e.error === "string"
        ? e.error
        : e.error === undefined
          ? JSON.stringify(e)
          : JSON.stringify(e.error);
    out.push({
      error,
      ...(typeof e.index === "number" && Number.isInteger(e.index) ? { index: e.index } : {}),
    });
  }
  return out.length > 0 ? out : undefined;
}

/**
 * Write a bulk job id as the GraphQL literal TTD's own example uses
 * (`bulkJob(id: 123)`), which is valid whether the argument is an `ID` or an
 * integer type. A variable would need the argument's declared type, which TTD's
 * page does not show. Only characters that cannot break out of the literal are
 * accepted.
 */
export function bulkJobIdLiteral(jobId: string): string {
  if (/^\d+$/.test(jobId)) return jobId;
  if (/^[A-Za-z0-9_-]+$/.test(jobId)) return JSON.stringify(jobId);
  throw new McpError(
    JsonRpcErrorCode.InvalidParams,
    `Invalid bulk job id ${JSON.stringify(jobId)}: TTD bulk job ids are numeric (for example 2989826).`
  );
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
 * `ttd_graphql_mutation_bulk` input cap. TTD allows up to 1000 inputs per job
 * (its Bulk operations page). This server caps lower on purpose: the tool has
 * never been run against TTD (#231), and a submitted job cannot be cancelled, so
 * the cap bounds how many writes one not-yet-exercised call can start. Raise it
 * once a sandbox run has confirmed the request shape.
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
 * TTD documents `createMutationBulk` (its Bulk operations page), but this server
 * has never submitted one to TTD, and a submitted job cannot be cancelled and
 * has no rollback. It can start up to MAX_MUTATION_BULK_INPUTS writes, so it
 * runs freely against the sandbox, or any non-TTD host (a local mock), and
 * against production only when the operator sets
 * TTD_ALLOW_UNVERIFIED_MUTATION_BULK=true. The check keys on the endpoint the
 * session actually calls, so a sandbox flag with a production override (which
 * the config guard already refuses) cannot slip through.
 *
 * The gate exists because the tool is unexercised, not because the operation is
 * unknown; it can be lifted once a sandbox run has confirmed the request shape.
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
    "ttd_graphql_mutation_bulk is disabled against production TTD until it has been run once " +
    "against the sandbox. TTD documents createMutationBulk, but this server has never submitted " +
    "one to TTD, and a submitted job cannot be cancelled or rolled back (#231). Run it against " +
    "the sandbox (TTD_USE_SANDBOX=true) first, or have the operator set " +
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

export interface GraphqlToken {
  kind: "punct" | "name" | "number" | "string" | "other";
  text: string;
}

/**
 * Split a GraphQL document into lexical tokens as the GraphQL spec (October
 * 2021, section 2.1) defines them: punctuators (`...` is one), names, numbers
 * and strings (block strings included). Whitespace, line terminators, commas and
 * comments are ignored. A character the lexer does not recognise is one `other`
 * token, so a malformed document is never undercounted.
 */
export function tokenizeGraphql(source: string): GraphqlToken[] {
  const tokens: GraphqlToken[] = [];
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
    const start = i;
    let kind: GraphqlToken["kind"];
    if (source.startsWith("...", i)) {
      kind = "punct";
      i += 3;
    } else if (GRAPHQL_PUNCTUATORS.has(ch)) {
      kind = "punct";
      i++;
    } else if (NAME_START.test(ch)) {
      kind = "name";
      i++;
      while (i < n && NAME_CONTINUE.test(source[i])) i++;
    } else if (source.startsWith('"""', i)) {
      kind = "string";
      i += 3;
      while (i < n && !source.startsWith('"""', i)) {
        i += source.startsWith('\\"""', i) ? 4 : 1;
      }
      i += 3;
    } else if (ch === '"') {
      kind = "string";
      i++;
      while (i < n && source[i] !== '"' && source[i] !== "\n") {
        i += source[i] === "\\" ? 2 : 1;
      }
      i++;
    } else {
      const number = NUMBER.exec(source.slice(i, i + 64));
      kind = number ? "number" : "other";
      i += number ? number[0].length : 1;
    }
    tokens.push({ kind, text: source.slice(start, Math.min(i, n)) });
  }
  return tokens;
}

/**
 * Count lexical tokens, the unit of TTD's 15,000-token limit on a bulk
 * mutation. This replaced a 60,000-character proxy that was not conservative:
 * punctuators are one character each, so 60k characters can hold far more than
 * 15k tokens.
 */
export function countGraphqlLexicalTokens(source: string): number {
  return tokenizeGraphql(source).length;
}

/**
 * What a bulk mutation string declares: how many mutation operations it holds
 * (TTD allows one) and the variables of the first, which each `mutationVariables`
 * entry is keyed by. Works on tokens, so a `$variable` or the word "mutation"
 * inside a comment or string is not counted.
 */
export function inspectBulkMutation(source: string): { operations: number; variables: string[] } {
  const tokens = tokenizeGraphql(source);
  let braces = 0;
  let parens = 0;
  let operations = 0;
  const variables: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t.kind === "punct") {
      if (t.text === "{") braces++;
      else if (t.text === "}") braces--;
      else if (t.text === "(") parens++;
      else if (t.text === ")") parens--;
      continue;
    }
    // At brace and paren depth 0 only: a field, a variable (`$mutation`) or a
    // word in a string is never an operation keyword.
    const isOperationKeyword =
      t.kind === "name" && t.text === "mutation" && braces === 0 && parens === 0;
    if (!isOperationKeyword) continue;

    operations++;
    if (operations > 1) continue;

    let j = i + 1;
    if (tokens[j]?.kind === "name") j++; // the operation's name
    if (tokens[j]?.kind === "punct" && tokens[j]!.text === "(") {
      let depth = 0;
      for (; j < tokens.length; j++) {
        const u = tokens[j]!;
        if (u.kind !== "punct") continue;
        if (u.text === "(") depth++;
        else if (u.text === ")") {
          depth--;
          if (depth === 0) break;
        } else if (u.text === "$" && depth === 1 && tokens[j + 1]?.kind === "name") {
          variables.push(tokens[j + 1]!.text);
        }
      }
    }
  }
  return { operations, variables };
}

// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Retryable Fetch — shared retry/backoff logic for platform HTTP clients
 *
 * Extracts the common retry loop used by all platform HTTP clients.
 * Platform-specific concerns (auth headers, error parsing, status mapping,
 * response envelope validation) are injected via callbacks.
 */

import type { Logger } from "pino";
import { McpError, ErrorHandler, JsonRpcErrorCode } from "./mcp-errors.js";
import { fetchWithTimeout } from "./fetch-with-timeout.js";
import type { RequestContext } from "./request-context.js";
import { setSpanAttribute } from "./telemetry.js";
import { recordUpstreamRequest, redactHeaders, truncateBody } from "./http-request-recorder.js";
import { redactSecretsInText, redactUrl } from "./secret-redaction.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3). */
  maxRetries?: number;
  /** Initial backoff in ms before first retry (default: 1000). */
  initialBackoffMs?: number;
  /** Maximum backoff cap in ms (default: 10000). */
  maxBackoffMs?: number;
  /** Request timeout in ms (default: 10000). */
  timeoutMs?: number;
  /** Platform name for log messages (e.g. "TTD", "Google Ads"). */
  platformName: string;
  /** Actionable hint appended to 401 errors for bearer-token platforms. */
  tokenExpiryHint?: string;
}

/** Signature matching fetchWithTimeout for dependency injection in tests. */
export type FetchWithTimeoutFn = typeof fetchWithTimeout;

export interface RetryableRequestOptions {
  /** Full URL to fetch. */
  url: string;
  /** Additional fetch options (method, body, etc.). */
  fetchOptions?: RequestInit;
  /** Request context for correlation. */
  context?: RequestContext;
  /** Logger instance. */
  logger: Logger;
  /**
   * Called before each attempt to build the auth + platform headers.
   * Must return all headers needed for this request (auth, content-type, etc.).
   */
  getHeaders: () => Promise<Record<string, string>>;
  /**
   * Map an HTTP error status + body to a JsonRpcErrorCode.
   * If not provided, uses a sensible default mapping.
   */
  mapStatusCode?: (status: number, body: string) => JsonRpcErrorCode;
  /**
   * Parse the error body into a human-readable summary.
   * If not provided, truncates raw body to 500 chars.
   */
  parseErrorBody?: (body: string) => string;
  /**
   * Override the fetch function (for testing). Defaults to fetchWithTimeout.
   */
  fetchFn?: FetchWithTimeoutFn;
  /**
   * Validate the parsed response body after a successful HTTP response (2xx).
   * Use this for platforms that wrap responses in an envelope (e.g., TikTok's
   * `{ code, message, data }` or Snapchat's `{ request_status, ... }`).
   *
   * - Return the unwrapped/validated data on success.
   * - Throw McpError on failure. Set `data.retryable = true` on the error
   *   if the envelope error is transient and should be retried.
   */
  validateResponseBody?: (body: unknown) => unknown;
  /**
   * Override the default STATUS/BODY retryability check (429 + 5xx).
   * Return true if this status/body combo represents a transient failure.
   * Useful for platforms with body-level error codes (e.g. Meta rate-limit codes).
   *
   * This decides the ERROR CLASS only. It does NOT decide whether the request
   * is safe to re-send — that stays with the shared method-idempotency guard,
   * which is applied on top of whatever this returns. Before the 2026-07-25
   * sweep (05-F3) an override REPLACED the whole decision, so three clients
   * that returned `status >= 500` method-agnostically silently defeated the
   * shared default's deliberate POST exclusion and could fire up to four
   * identical money-moving creates (a 502/504 seen by the client can arrive
   * after the platform committed the write).
   *
   * To retry a non-idempotent method anyway, set {@link retryNonIdempotent}.
   */
  isRetryable?: (status: number, errorBody: string) => boolean;
  /**
   * Allow retrying methods that are not idempotent by HTTP semantics (POST).
   *
   * Off by default. Set this ONLY for endpoints whose re-send cannot duplicate
   * a resource — a POST used for a read (GraphQL query, report polling) or one
   * carrying a server-honoured idempotency key. Setting it for a create is how
   * you get duplicate live campaigns.
   */
  retryNonIdempotent?: boolean;
  /**
   * Called after every fetch response (success or error) for observability.
   * Use for logging rate-limit headers, usage metrics, etc.
   */
  onResponse?: (response: Response, context?: RequestContext) => void;
  /**
   * Return extra keys to merge into McpError.data on error responses.
   * Useful for platform-specific error metadata (e.g., Meta error codes).
   */
  buildErrorData?: (status: number, errorBody: string) => Record<string, unknown>;
  /**
   * Override the `nextAction` hint on McpError.data. Receives the HTTP status,
   * the (untruncated) error body, and the default generic hint computed from
   * status code. Return a richer domain-specific hint, or `undefined` to clear,
   * or simply return the default to keep generic behavior.
   *
   * Use this when a platform exposes structured error codes that imply a
   * specific user action (e.g., Meta error code 100 → "field permission" hint,
   * Google Ads `POLICY_FINDING` → "request exemption", LinkedIn `SERVICE_ERROR
   * subcode INVALID_ACCESS_TOKEN` → "regenerate token at...").
   */
  buildNextAction?: (
    status: number,
    errorBody: string,
    defaultNextAction: string | undefined
  ) => string | undefined;
  /**
   * The platform's DOCUMENTED wait, in ms, for a throttled response that
   * carries no usable `Retry-After` header — e.g. Microsoft Advertising error
   * 117 CallRateExceeded ("resubmit ... after waiting 60 seconds") or a TTD 429
   * ("wait 1 minute after a failed call"). Return `undefined` when the response
   * is not a throttle. A `Retry-After` header, when present, always wins.
   *
   * The required wait is published as `data.retryAfterMs` on the error, and a
   * wait longer than this call's `maxBackoffMs` ends retrying instead of being
   * silently shortened: re-sending before the platform said to only extends the
   * throttle.
   */
  throttleDelayMs?: (status: number, errorBody: string) => number | undefined;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/**
 * Default retry budget. This is a count of RETRIES, not attempts: the loop is
 * `for (attempt = 0; attempt <= maxRetries; attempt++)`, so the budget below
 * permits up to `maxRetries + 1` total requests. Exported because the server
 * card publishes the attempt count a client should expect us to place on their
 * account's quota, and that number has to be derived from this one rather than
 * transcribed beside it (#201).
 */
export const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_INITIAL_BACKOFF_MS = 1_000;
const DEFAULT_MAX_BACKOFF_MS = 10_000;
const DEFAULT_TIMEOUT_MS = 10_000;

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * Methods whose re-send after an ambiguous failure cannot duplicate a
 * resource. GET/HEAD/OPTIONS are read-only; PUT and DELETE are idempotent by
 * HTTP semantics; PATCH is included because this fleet's PATCH bodies are
 * absolute field sets under an updateMask (re-applying yields the same
 * state). POST is deliberately absent: a 5xx observed by the client (e.g. a
 * gateway 502/504) can arrive AFTER the platform committed the create, and a
 * blind re-send then duplicates the entity — real budget/spend on an ad
 * platform (external-write-rail review C3).
 */
export const IDEMPOTENT_RETRY_METHODS: ReadonlySet<string> = new Set([
  "GET",
  "HEAD",
  "OPTIONS",
  "PUT",
  "DELETE",
  "PATCH",
]);

/**
 * Is this method safe to re-send after an ambiguous failure?
 *
 * 429 is always safe: the platform rejected the request WITHOUT processing it,
 * so nothing was committed. Every other retryable status (5xx) is ambiguous —
 * the client cannot tell a rejected request from a committed one whose response
 * was lost — so it is only safe for methods that cannot duplicate a resource.
 *
 * Applied on top of the status/body decision, whether that came from the
 * default or from a caller's `isRetryable`. Callers with POST endpoints that are
 * genuinely safe to re-send opt in with `retryNonIdempotent`.
 */
function isMethodSafeToResend(status: number, method: string): boolean {
  if (status === 429) return true;
  return IDEMPOTENT_RETRY_METHODS.has(method.toUpperCase());
}

/**
 * Representative statuses probed by {@link describeRetryPolicy}. One per class
 * a platform predicate is known to discriminate on, not an exhaustive sweep:
 * the point is to report the policy's SHAPE, not to enumerate every code.
 */
const PROBE_STATUSES = [400, 401, 403, 404, 408, 409, 429, 500, 502, 503, 504] as const;

/** The retry policy actually in force, as observed by probing the real predicate. */
export interface ObservedRetryPolicy {
  /** Statuses this client treats as transient, in ascending order. */
  retryOnStatus: number[];
  /**
   * Methods whose re-send after an ambiguous (5xx) failure cannot duplicate a
   * resource. Read from the live {@link IDEMPOTENT_RETRY_METHODS} set.
   */
  resendSafeMethodsOn5xx: string[];
  /**
   * Statuses that are safe to re-send for ANY method, including POST, because
   * the platform rejected the request without processing it.
   */
  resendSafeForAllMethods: number[];
  /** Total requests a client should expect, including the first. */
  maxTotalAttempts: number;
}

/**
 * Describe the retry policy a client will actually experience, by EXECUTING the
 * same predicate and method set the retry loop branches on.
 *
 * This exists because the server card publishes these values (#201) and a
 * transcribed copy would be wrong the day a platform tunes its predicate. Two
 * fleet facts made that concrete: `amazon-dsp` deliberately omits 429 from its
 * `isRetryable`, and its budget is `maxRetries: 2` where the rest of the fleet
 * is 3 — so neither `[429, "5xx"]` nor `maxTotalAttempts: 4` is a fleet-wide
 * truth, and publishing them as one would understate the load on one account's
 * quota while overstating it on another.
 *
 * @param isRetryable The client's error-class override, if it has one. Omit to
 *   describe the shared default.
 * @param maxRetries The client's retry budget. Omit for {@link DEFAULT_MAX_RETRIES}.
 */
export function describeRetryPolicy(
  isRetryable?: (status: number, errorBody: string) => boolean,
  maxRetries: number = DEFAULT_MAX_RETRIES
): ObservedRetryPolicy {
  const decide = isRetryable ?? ((status: number) => isRetryableStatus(status));
  const retryOnStatus = PROBE_STATUSES.filter((status) => decide(status, ""));
  return {
    retryOnStatus: [...retryOnStatus],
    resendSafeMethodsOn5xx: [...IDEMPOTENT_RETRY_METHODS].sort(),
    // Derived from the live guard, not restated: `isMethodSafeToResend` returns
    // true for these regardless of method, which is precisely why "POST is never
    // retried" is not an accurate description of this fleet.
    resendSafeForAllMethods: retryOnStatus.filter((status) => isMethodSafeToResend(status, "POST")),
    maxTotalAttempts: maxRetries + 1,
  };
}

/**
 * Default HTTP status -> JsonRpcErrorCode mapper.
 *
 * Platform HTTP clients should use this as a fallback after handling any
 * platform-specific cases (custom error codes, envelope errors, etc.) so that
 * standard HTTP semantics (404 -> NotFound, 429 -> RateLimited, etc.) stay
 * consistent across servers.
 */
export function mapHttpStatusToJsonRpc(status: number): JsonRpcErrorCode {
  if (status >= 500) return JsonRpcErrorCode.ServiceUnavailable;
  if (status === 429) return JsonRpcErrorCode.RateLimited;
  if (status === 403) return JsonRpcErrorCode.Forbidden;
  if (status === 401) return JsonRpcErrorCode.Unauthorized;
  if (status === 404) return JsonRpcErrorCode.NotFound;
  return JsonRpcErrorCode.InvalidRequest;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function calculateBackoff(
  attempt: number,
  initialBackoffMs: number,
  maxBackoffMs: number,
  response: Response
): number {
  let delayMs = Math.min(initialBackoffMs * Math.pow(2, attempt), maxBackoffMs);

  // Respect Retry-After header on any retryable response (429, 5xx, or custom)
  {
    const retryAfter = response.headers.get("Retry-After");
    if (retryAfter) {
      const retryAfterSeconds = parseInt(retryAfter, 10);
      if (!isNaN(retryAfterSeconds)) {
        delayMs = Math.min(retryAfterSeconds * 1000, maxBackoffMs);
      }
    }
  }

  return delayMs;
}

// ---------------------------------------------------------------------------
// Core retry loop
// ---------------------------------------------------------------------------

/**
 * Execute a fetch request with exponential backoff retry on transient errors.
 *
 * Retries on HTTP 429 and 5xx. Respects `Retry-After` header for 429s.
 * Returns parsed JSON on success, or `{}` for 204 No Content.
 *
 * If `validateResponseBody` is provided, calls it after parsing a successful
 * response. If the validator throws with `data.retryable = true`, the request
 * is retried up to `maxRetries` times.
 */
export async function executeWithRetry(
  config: RetryConfig,
  options: RetryableRequestOptions
): Promise<unknown> {
  const maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
  const initialBackoffMs = config.initialBackoffMs ?? DEFAULT_INITIAL_BACKOFF_MS;
  const maxBackoffMs = config.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const {
    url,
    fetchOptions,
    context,
    logger,
    getHeaders,
    mapStatusCode,
    parseErrorBody,
    validateResponseBody,
    isRetryable,
    onResponse,
    buildErrorData,
    buildNextAction,
    throttleDelayMs,
  } = options;
  const doFetch = options.fetchFn ?? fetchWithTimeout;

  let lastError: McpError | undefined;

  const method = fetchOptions?.method ?? "GET";
  const requestBodyRedacted = truncateBody(fetchOptions?.body as unknown);

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const headers = await getHeaders();
    const requestHeadersRedacted = redactHeaders({
      ...headers,
      ...(fetchOptions?.headers as Record<string, string> | undefined),
    });

    const attemptStart = Date.now();
    let response: Response;
    try {
      response = await doFetch(url, timeoutMs, context, {
        ...fetchOptions,
        headers: {
          ...headers,
          ...fetchOptions?.headers,
        },
      });
    } catch (networkError) {
      // Network error / timeout — record and rethrow; callers already handle this.
      recordUpstreamRequest({
        method,
        url,
        durationMs: Date.now() - attemptStart,
        attempt,
        requestBodyRedacted,
        requestHeadersRedacted,
        networkError: (networkError as Error)?.message ?? String(networkError),
      });
      throw networkError;
    }

    onResponse?.(response, context);

    if (response.ok) {
      setSpanAttribute("http.response.status_code", response.status);
      if (response.status === 204) {
        recordUpstreamRequest({
          method,
          url,
          status: 204,
          durationMs: Date.now() - attemptStart,
          attempt,
          requestBodyRedacted,
          requestHeadersRedacted,
          responseHeadersRedacted: redactHeaders(response.headers),
        });
        return {};
      }

      const body = await response.json();

      if (validateResponseBody) {
        try {
          const validated = validateResponseBody(body);
          // Success: compact record with no response body to bound log size.
          recordUpstreamRequest({
            method,
            url,
            status: response.status,
            durationMs: Date.now() - attemptStart,
            attempt,
            requestBodyRedacted,
            requestHeadersRedacted,
            responseHeadersRedacted: redactHeaders(response.headers),
          });
          return validated;
        } catch (envelopeError: unknown) {
          // Envelope failure (e.g. TikTok `code !== 0`, Snapchat
          // `request_status=FAILED`): HTTP is 2xx but the platform signaled
          // an error in the payload. Capture the parsed body so the failure
          // trail contains the actual platform error message.
          recordUpstreamRequest({
            method,
            url,
            status: response.status,
            durationMs: Date.now() - attemptStart,
            attempt,
            requestBodyRedacted,
            requestHeadersRedacted,
            responseHeadersRedacted: redactHeaders(response.headers),
            responseBodyRedacted: truncateBody(body),
          });

          if (
            envelopeError instanceof McpError &&
            (envelopeError.data as Record<string, unknown>)?.retryable === true &&
            attempt < maxRetries
          ) {
            lastError = envelopeError;
            const delayMs = calculateBackoff(attempt, initialBackoffMs, maxBackoffMs, response);
            logger.warn(
              {
                url,
                method: fetchOptions?.method ?? "GET",
                attempt: attempt + 1,
                maxRetries,
                delayMs,
                requestId: context?.requestId,
              },
              `Retrying ${config.platformName} API request after envelope validation error`
            );
            await sleep(delayMs);
            continue;
          }
          throw envelopeError;
        }
      }

      // No envelope validator — record compact success and return.
      recordUpstreamRequest({
        method,
        url,
        status: response.status,
        durationMs: Date.now() - attemptStart,
        attempt,
        requestBodyRedacted,
        requestHeadersRedacted,
        responseHeadersRedacted: redactHeaders(response.headers),
      });
      return body;
    }

    const errorBody = await response.text().catch(() => "");

    // Capture the upstream failure so downstream analysis has the platform's
    // response body — the main gap we're closing.
    recordUpstreamRequest({
      method,
      url,
      status: response.status,
      durationMs: Date.now() - attemptStart,
      attempt,
      requestBodyRedacted,
      requestHeadersRedacted,
      responseHeadersRedacted: redactHeaders(response.headers),
      responseBodyRedacted: truncateBody(errorBody),
    });

    const errorCode = mapStatusCode
      ? mapStatusCode(response.status, errorBody)
      : mapHttpStatusToJsonRpc(response.status);
    const errorSummary = parseErrorBody ? parseErrorBody(errorBody) : errorBody.substring(0, 500);

    let errorMessage = `${config.platformName} API request failed: ${response.status} ${response.statusText}${errorSummary ? ` — ${errorSummary}` : ""}`;
    if (response.status === 401 && config.tokenExpiryHint) {
      errorMessage += `\n\nAction required: ${config.tokenExpiryHint}`;
    }

    const retryAfterHeader = response.headers.get("Retry-After");
    const retryAfterSeconds =
      retryAfterHeader && !isNaN(parseInt(retryAfterHeader, 10))
        ? parseInt(retryAfterHeader, 10)
        : undefined;
    const defaultNextAction = ErrorHandler.defaultNextActionForStatus(response.status, {
      retryAfterSeconds,
      tokenExpiryHint: config.tokenExpiryHint,
    });
    const nextAction = buildNextAction
      ? buildNextAction(response.status, errorBody, defaultNextAction)
      : defaultNextAction;
    const platformExtras = buildErrorData?.(response.status, errorBody);

    // The wait the platform asked for, if it named one: the Retry-After header,
    // else the platform's documented throttle wait.
    const requiredDelayMs =
      retryAfterSeconds !== undefined
        ? retryAfterSeconds * 1000
        : throttleDelayMs?.(response.status, errorBody);

    const mcpError = new McpError(errorCode, errorMessage, {
      requestId: context?.requestId,
      httpStatus: response.status,
      // Redacted at the source rather than relying on every reader of `data` to
      // call `sanitizeErrorData` (#741 H-2). `errorBody` is a slice of the raw
      // upstream response — the field most likely to hold a `refresh_token` on
      // a 401 — and `url` can carry a credential in a query param.
      url: redactUrl(url),
      method: fetchOptions?.method ?? "GET",
      errorBody: redactSecretsInText(errorBody.substring(0, 500)),
      attempt,
      ...(response.status === 401 && config.tokenExpiryHint
        ? { tokenExpiryHint: config.tokenExpiryHint }
        : {}),
      ...(nextAction !== undefined ? { nextAction } : {}),
      ...(requiredDelayMs !== undefined ? { retryAfterMs: requiredDelayMs } : {}),
      ...platformExtras,
    });

    // Two independent questions, deliberately not collapsible into one hook:
    //   1. is this failure transient?  (platform-specific — the override)
    //   2. is this request safe to re-send?  (HTTP semantics — always ours)
    // An override answering only (1) must never be able to answer (2) by
    // omission; that is what let a 5xx on a create be retried four times.
    const statusRetryable = isRetryable
      ? isRetryable(response.status, errorBody)
      : isRetryableStatus(response.status);
    const retryable =
      statusRetryable &&
      (options.retryNonIdempotent === true || isMethodSafeToResend(response.status, method));

    if (!retryable || attempt >= maxRetries) {
      throw mcpError;
    }

    // The platform named a wait longer than this call may sleep. Retrying at
    // `maxBackoffMs` instead (the old behaviour: Retry-After was silently
    // capped) re-sends before the platform allows it, which only extends the
    // throttle. Surface the error with `retryAfterMs` and let the caller wait.
    if (requiredDelayMs !== undefined && requiredDelayMs > maxBackoffMs) {
      throw mcpError;
    }

    lastError = mcpError;

    const delayMs =
      requiredDelayMs ?? calculateBackoff(attempt, initialBackoffMs, maxBackoffMs, response);

    logger.warn(
      {
        url,
        method: fetchOptions?.method ?? "GET",
        status: response.status,
        attempt: attempt + 1,
        maxRetries,
        delayMs,
        requestId: context?.requestId,
      },
      `Retrying ${config.platformName} API request after transient error`
    );

    await sleep(delayMs);
  }

  throw (
    lastError ??
    new McpError(JsonRpcErrorCode.InternalError, "Unexpected retry loop exit", {
      requestId: context?.requestId,
    })
  );
}

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
import { McpError, JsonRpcErrorCode } from "./mcp-errors.js";
import { fetchWithTimeout } from "./fetch-with-timeout.js";
import type { RequestContext } from "./request-context.js";
import { setSpanAttribute } from "./telemetry.js";
import { recordUpstreamRequest, redactHeaders, truncateBody } from "./http-request-recorder.js";

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
   * Override the default retryability check (429 + 5xx).
   * Return true if the request should be retried for this status/body combo.
   * Useful for platforms with body-level error codes (e.g., Meta rate limit codes).
   */
  isRetryable?: (status: number, errorBody: string) => boolean;
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
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_INITIAL_BACKOFF_MS = 1_000;
const DEFAULT_MAX_BACKOFF_MS = 10_000;
const DEFAULT_TIMEOUT_MS = 10_000;

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function defaultMapStatusCode(status: number): JsonRpcErrorCode {
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
      : defaultMapStatusCode(response.status);
    const errorSummary = parseErrorBody ? parseErrorBody(errorBody) : errorBody.substring(0, 500);

    let errorMessage = `${config.platformName} API request failed: ${response.status} ${response.statusText}${errorSummary ? ` — ${errorSummary}` : ""}`;
    if (response.status === 401 && config.tokenExpiryHint) {
      errorMessage += `\n\nAction required: ${config.tokenExpiryHint}`;
    }

    const mcpError = new McpError(errorCode, errorMessage, {
      requestId: context?.requestId,
      httpStatus: response.status,
      url,
      method: fetchOptions?.method ?? "GET",
      errorBody: errorBody.substring(0, 500),
      attempt,
      ...(response.status === 401 && config.tokenExpiryHint
        ? { tokenExpiryHint: config.tokenExpiryHint }
        : {}),
      ...buildErrorData?.(response.status, errorBody),
    });

    const retryable = isRetryable
      ? isRetryable(response.status, errorBody)
      : isRetryableStatus(response.status);

    if (!retryable || attempt >= maxRetries) {
      throw mcpError;
    }

    lastError = mcpError;

    const delayMs = calculateBackoff(attempt, initialBackoffMs, maxBackoffMs, response);

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

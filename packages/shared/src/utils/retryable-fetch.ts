/**
 * Retryable Fetch — shared retry/backoff logic for platform HTTP clients
 *
 * Extracts the common retry loop used by TTD, GADS, and Meta HTTP clients.
 * Platform-specific concerns (auth headers, error parsing, status mapping)
 * are injected via the `RetryConfig` callbacks.
 */

import type { Logger } from "pino";
import { McpError, JsonRpcErrorCode } from "./mcp-errors.js";
import { fetchWithTimeout } from "./fetch-with-timeout.js";
import type { RequestContext } from "./request-context.js";
import { setSpanAttribute } from "./telemetry.js";

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

// ---------------------------------------------------------------------------
// Core retry loop
// ---------------------------------------------------------------------------

/**
 * Execute a fetch request with exponential backoff retry on transient errors.
 *
 * Retries on HTTP 429 and 5xx. Respects `Retry-After` header for 429s.
 * Returns parsed JSON on success, or `{}` for 204 No Content.
 */
export async function executeWithRetry(
  config: RetryConfig,
  options: RetryableRequestOptions
): Promise<unknown> {
  const maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
  const initialBackoffMs = config.initialBackoffMs ?? DEFAULT_INITIAL_BACKOFF_MS;
  const maxBackoffMs = config.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const { url, fetchOptions, context, logger, getHeaders, mapStatusCode, parseErrorBody } = options;
  const doFetch = options.fetchFn ?? fetchWithTimeout;

  let lastError: McpError | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const headers = await getHeaders();

    const response = await doFetch(url, timeoutMs, context, {
      ...fetchOptions,
      headers: {
        ...headers,
        ...fetchOptions?.headers,
      },
    });

    if (response.ok) {
      setSpanAttribute("http.response.status_code", response.status);
      if (response.status === 204) {
        return {};
      }
      return response.json();
    }

    const errorBody = await response.text().catch(() => "");
    const errorCode = mapStatusCode
      ? mapStatusCode(response.status, errorBody)
      : defaultMapStatusCode(response.status);
    const errorSummary = parseErrorBody
      ? parseErrorBody(errorBody)
      : errorBody.substring(0, 500);

    const mcpError = new McpError(
      errorCode,
      `${config.platformName} API request failed: ${response.status} ${response.statusText}${errorSummary ? ` — ${errorSummary}` : ""}`,
      {
        requestId: context?.requestId,
        httpStatus: response.status,
        url,
        method: fetchOptions?.method ?? "GET",
        errorBody: errorBody.substring(0, 500),
        attempt,
      }
    );

    if (!isRetryableStatus(response.status) || attempt >= maxRetries) {
      throw mcpError;
    }

    lastError = mcpError;

    let delayMs = Math.min(
      initialBackoffMs * Math.pow(2, attempt),
      maxBackoffMs
    );

    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After");
      if (retryAfter) {
        const retryAfterSeconds = parseInt(retryAfter, 10);
        if (!isNaN(retryAfterSeconds)) {
          delayMs = Math.min(retryAfterSeconds * 1000, maxBackoffMs);
        }
      }
    }

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

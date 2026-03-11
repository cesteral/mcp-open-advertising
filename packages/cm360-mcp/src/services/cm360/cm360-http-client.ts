import type { Logger } from "pino";
import type { GoogleAuthAdapter } from "@cesteral/shared";
import { McpError, JsonRpcErrorCode } from "../../utils/errors/index.js";
import { fetchWithTimeout } from "@cesteral/shared";
import type { RequestContext } from "@cesteral/shared";
import { withCM360ApiSpan, setSpanAttribute } from "../../utils/telemetry/tracing.js";

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 10_000;

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

export class CM360HttpClient {
  constructor(
    private authAdapter: GoogleAuthAdapter,
    private baseUrl: string,
    private logger: Logger
  ) {}

  async fetch(
    path: string,
    context?: RequestContext,
    options?: RequestInit
  ): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;
    const method = options?.method || "GET";

    this.logger.debug(
      { url, method, requestId: context?.requestId },
      "Making CM360 API request"
    );

    return withCM360ApiSpan(`api.${method}`, path, async (span) => {
      span.setAttribute("http.request.method", method);
      span.setAttribute("http.url", url);
      return this.executeWithRetry(url, 10_000, context, options);
    });
  }

  async fetchRaw(
    url: string,
    timeoutMs: number,
    context?: RequestContext,
    options?: RequestInit
  ): Promise<Response> {
    const method = options?.method || "GET";

    return withCM360ApiSpan(`api.raw.${method}`, url, async (span) => {
      span.setAttribute("http.request.method", method);
      span.setAttribute("http.url", url);
      const accessToken = await this.authAdapter.getAccessToken();
      const response = await fetchWithTimeout(url, timeoutMs, context, {
        ...options,
        headers: {
          ...options?.headers,
          Authorization: `Bearer ${accessToken}`,
        },
      });
      span.setAttribute("http.response.status_code", response.status);
      return response;
    });
  }

  private async executeWithRetry(
    url: string,
    timeoutMs: number,
    context?: RequestContext,
    options?: RequestInit
  ): Promise<unknown> {
    let lastError: McpError | undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const accessToken = await this.authAdapter.getAccessToken();

      const response = await fetchWithTimeout(url, timeoutMs, context, {
        ...options,
        headers: {
          ...options?.headers,
          Authorization: `Bearer ${accessToken}`,
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
      const mcpError = new McpError(
        response.status >= 500
          ? JsonRpcErrorCode.ServiceUnavailable
          : response.status === 429
            ? JsonRpcErrorCode.RateLimited
            : JsonRpcErrorCode.InvalidRequest,
        `CM360 API request failed: ${response.status} ${response.statusText}`,
        {
          requestId: context?.requestId,
          httpStatus: response.status,
          url,
          method: options?.method ?? "GET",
          errorBody: errorBody.substring(0, 500),
          attempt,
        }
      );

      if (!isRetryableStatus(response.status) || attempt >= MAX_RETRIES) {
        throw mcpError;
      }

      lastError = mcpError;

      let delayMs = Math.min(
        INITIAL_BACKOFF_MS * Math.pow(2, attempt),
        MAX_BACKOFF_MS
      );

      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After");
        if (retryAfter) {
          const retryAfterSeconds = parseInt(retryAfter, 10);
          if (!isNaN(retryAfterSeconds)) {
            delayMs = Math.min(retryAfterSeconds * 1000, MAX_BACKOFF_MS);
          }
        }
      }

      this.logger.warn(
        {
          url,
          method: options?.method ?? "GET",
          status: response.status,
          attempt: attempt + 1,
          maxRetries: MAX_RETRIES,
          delayMs,
          requestId: context?.requestId,
        },
        "Retrying CM360 API request after transient error"
      );

      await this.sleep(delayMs);
    }

    throw (
      lastError ??
      new McpError(JsonRpcErrorCode.InternalError, "Unexpected retry loop exit", {
        requestId: context?.requestId,
      })
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

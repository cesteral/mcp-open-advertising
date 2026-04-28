// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * MCP Error System — shared across all Cesteral MCP servers
 *
 * Provides JSON-RPC 2.0 error codes, a structured McpError class,
 * and a central ErrorHandler for consistent error processing.
 */

import type { Logger } from "pino";

// ---------------------------------------------------------------------------
// JSON-RPC 2.0 Error Codes
// ---------------------------------------------------------------------------

export enum JsonRpcErrorCode {
  // Standard JSON-RPC 2.0 errors
  ParseError = -32700,
  InvalidRequest = -32600,
  MethodNotFound = -32601,
  InvalidParams = -32602,
  InternalError = -32603,

  // Implementation-defined errors (-32000 to -32099)
  ServiceUnavailable = -32000,
  NotFound = -32001,
  Conflict = -32002,
  RateLimited = -32003,
  Timeout = -32004,
  Forbidden = -32005,
  Unauthorized = -32006,
  ValidationError = -32007,
}

/**
 * Map error code to HTTP status code
 */
export function mapErrorCodeToHttpStatus(code: JsonRpcErrorCode): number {
  switch (code) {
    case JsonRpcErrorCode.ParseError:
    case JsonRpcErrorCode.InvalidRequest:
    case JsonRpcErrorCode.InvalidParams:
    case JsonRpcErrorCode.ValidationError:
      return 400;

    case JsonRpcErrorCode.Unauthorized:
      return 401;

    case JsonRpcErrorCode.Forbidden:
      return 403;

    case JsonRpcErrorCode.NotFound:
    case JsonRpcErrorCode.MethodNotFound:
      return 404;

    case JsonRpcErrorCode.Conflict:
      return 409;

    case JsonRpcErrorCode.RateLimited:
      return 429;

    case JsonRpcErrorCode.InternalError:
      return 500;

    case JsonRpcErrorCode.ServiceUnavailable:
      return 503;

    case JsonRpcErrorCode.Timeout:
      return 504;

    default:
      return 500;
  }
}

// ---------------------------------------------------------------------------
// McpErrorData — well-known data fields
// ---------------------------------------------------------------------------

/**
 * Well-known optional fields on `McpError.data`. Defining them here gives
 * clients a stable shape they can rely on across every server, while keeping
 * the data bag open via the index signature for platform-specific extras.
 *
 * The two fields that matter most for an LLM caller:
 *   - `suggestedValues` — when an enum/oneOf field rejected: the legal values.
 *   - `nextAction` — single-sentence "what to do" hint (e.g. "Renew the access
 *     token at https://…", "Wait <Retry-After> seconds before retrying",
 *     "Call linkedin_list_ad_accounts to discover valid adAccountUrn values").
 *
 * Both are optional. Producers populate them when there's something useful to
 * say; consumers (formatters, error UIs) MAY surface them verbatim.
 */
export interface McpErrorData {
  /** Correlation ID, when known. */
  requestId?: string;
  /** Upstream HTTP status when the error came from a downstream API call. */
  httpStatus?: number;
  /** URL that produced the error (no query secrets — those get redacted). */
  url?: string;
  /** HTTP method of the failing request. */
  method?: string;
  /** Truncated body of the upstream error response. */
  errorBody?: string;
  /** Attempt number (0-indexed) on which the failure occurred. */
  attempt?: number;
  /**
   * Enum/oneOf values the failing field accepts. Set when the error is caused
   * by a field whose value isn't in the allowed set, so the caller can pick
   * one of these on the next call without re-prompting blindly.
   */
  suggestedValues?: string[];
  /**
   * One-line guidance describing the next concrete action that has the best
   * chance of resolving the error. Examples:
   *   - "Wait <N> seconds and retry — Retry-After header was set"
   *   - "Renew the LinkedIn access token at https://www.linkedin.com/developers/tools/oauth/token-generator"
   *   - "Call meta_list_ad_accounts to discover valid adAccountId values"
   */
  nextAction?: string;
  /** Free-form additional context. Don't rely on the shape. */
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// McpError
// ---------------------------------------------------------------------------

export class McpError extends Error {
  public readonly code: JsonRpcErrorCode;
  public readonly data?: McpErrorData;

  constructor(
    code: JsonRpcErrorCode,
    message?: string,
    data?: McpErrorData,
    options?: { cause?: unknown }
  ) {
    super(message || "An error occurred");
    this.name = "McpError";
    this.code = code;
    this.data = data;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, McpError);
    }

    if (options?.cause) {
      this.cause = options.cause;
    }
  }

  toJsonRpc(): {
    code: number;
    message: string;
    data?: McpErrorData;
  } {
    return {
      code: this.code,
      message: this.message,
      data: this.data,
    };
  }

  static fromError(
    error: unknown,
    defaultCode: JsonRpcErrorCode = JsonRpcErrorCode.InternalError
  ): McpError {
    if (error instanceof McpError) {
      return error;
    }

    if (error instanceof Error) {
      return new McpError(defaultCode, error.message, undefined, {
        cause: error,
      });
    }

    return new McpError(defaultCode, String(error), { originalError: String(error) });
  }
}

// ---------------------------------------------------------------------------
// ErrorHandler
// ---------------------------------------------------------------------------

export interface ErrorContext {
  operation: string;
  context?: Record<string, unknown>;
  input?: unknown;
  requestId?: string;
}

export class ErrorHandler {
  static handleError(error: unknown, errorContext: ErrorContext, logger?: Logger): McpError {
    if (error instanceof McpError) {
      logger?.error(
        {
          error: error.message,
          code: error.code,
          data: error.data,
          ...errorContext,
        },
        `Error in ${errorContext.operation}`
      );
      return error;
    }

    const mcpError = this.convertToMcpError(error);

    logger?.error(
      {
        error: mcpError.message,
        code: mcpError.code,
        data: mcpError.data,
        originalError: error instanceof Error ? error.stack : String(error),
        ...errorContext,
      },
      `Error in ${errorContext.operation}`
    );

    return mcpError;
  }

  /**
   * Map an HTTP status code to the corresponding JsonRpcErrorCode.
   * Returns undefined if the status doesn't map to a known code.
   */
  private static mapHttpStatusToCode(status: number): JsonRpcErrorCode | undefined {
    if (status === 400) return JsonRpcErrorCode.InvalidRequest;
    if (status === 401) return JsonRpcErrorCode.Unauthorized;
    if (status === 403) return JsonRpcErrorCode.Forbidden;
    if (status === 404) return JsonRpcErrorCode.NotFound;
    if (status === 409) return JsonRpcErrorCode.Conflict;
    if (status === 429) return JsonRpcErrorCode.RateLimited;
    if (status === 504) return JsonRpcErrorCode.Timeout;
    if (status >= 500) return JsonRpcErrorCode.ServiceUnavailable;
    return undefined;
  }

  private static convertToMcpError(error: unknown): McpError {
    if (error instanceof McpError) {
      return error;
    }

    if (error instanceof Error) {
      // Prefer structured HTTP status codes over message substring matching.
      // Only check .statusCode and .status — NOT .code, which Node.js uses for
      // string error codes (e.g. "ECONNREFUSED") and gRPC uses for non-HTTP numerics.
      const statusCode = (error as any).statusCode ?? (error as any).status;
      if (typeof statusCode === "number" && statusCode >= 100) {
        const mapped = this.mapHttpStatusToCode(statusCode);
        if (mapped !== undefined) {
          return new McpError(mapped, error.message, undefined, { cause: error });
        }
      }

      // Fall back to message-based classification
      const errorMessage = error.message.toLowerCase();

      if (errorMessage.includes("not found")) {
        return new McpError(JsonRpcErrorCode.NotFound, error.message, undefined, { cause: error });
      }
      if (errorMessage.includes("unauthorized") || errorMessage.includes("authentication")) {
        return new McpError(JsonRpcErrorCode.Unauthorized, error.message, undefined, {
          cause: error,
        });
      }
      if (errorMessage.includes("forbidden") || errorMessage.includes("permission")) {
        return new McpError(JsonRpcErrorCode.Forbidden, error.message, undefined, { cause: error });
      }
      if (errorMessage.includes("timeout") || errorMessage.includes("timed out")) {
        return new McpError(JsonRpcErrorCode.Timeout, error.message, undefined, { cause: error });
      }
      if (errorMessage.includes("rate limit") || errorMessage.includes("too many requests")) {
        return new McpError(JsonRpcErrorCode.RateLimited, error.message, undefined, {
          cause: error,
        });
      }
      if (errorMessage.includes("validation") || errorMessage.includes("invalid")) {
        return new McpError(JsonRpcErrorCode.ValidationError, error.message, undefined, {
          cause: error,
        });
      }

      return new McpError(JsonRpcErrorCode.InternalError, error.message, undefined, {
        cause: error,
      });
    }

    return new McpError(JsonRpcErrorCode.InternalError, "An unknown error occurred", {
      originalError: String(error),
    });
  }

  /**
   * Suggest a default `nextAction` string for an HTTP status code. Returns
   * undefined when there's no obvious generic guidance — callers should
   * supply a domain-specific hint via `RetryConfig.tokenExpiryHint` or
   * `buildErrorData` instead.
   */
  static defaultNextActionForStatus(
    status: number,
    options?: { retryAfterSeconds?: number; tokenExpiryHint?: string }
  ): string | undefined {
    if (status === 401) {
      return options?.tokenExpiryHint
        ? `Renew the API token. ${options.tokenExpiryHint}`
        : "Renew the API token (401 Unauthorized).";
    }
    if (status === 403) {
      return "Verify the authenticated user has permission for this resource. Some platforms require an additional scope or partner-level access.";
    }
    if (status === 404) {
      return "Verify the entity ID with the corresponding list_* tool before retrying.";
    }
    if (status === 409) {
      return "Re-fetch the entity, reapply your changes against the latest version, and retry.";
    }
    if (status === 429) {
      return options?.retryAfterSeconds !== undefined
        ? `Wait ${options.retryAfterSeconds} seconds (Retry-After header) before retrying.`
        : "Back off and retry with exponential delay; reduce request rate.";
    }
    if (status >= 500 && status < 600) {
      return "Upstream service error — retry with exponential backoff. If it persists, the upstream API may be experiencing an outage.";
    }
    return undefined;
  }

  static sanitizeErrorData(data?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!data) return undefined;

    const sanitized: Record<string, unknown> = {};
    const sensitiveKeys = [
      "password",
      "secret",
      "token",
      "apiKey",
      "api_key",
      "accessToken",
      "access_token",
      "refreshToken",
      "refresh_token",
      "credentials",
    ];

    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();
      if (sensitiveKeys.some((sensitiveKey) => lowerKey.includes(sensitiveKey))) {
        sanitized[key] = "[REDACTED]";
      } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        sanitized[key] = this.sanitizeErrorData(value as Record<string, unknown>);
      } else if (typeof value === "string") {
        // String values (e.g. `errorBody` copied from an upstream response)
        // can still embed bearer-token or access_token substrings even when
        // the key itself looks benign. Strip the common patterns.
        sanitized[key] = redactSecretsInString(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }
}

const STRING_SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/(Bearer\s+)[A-Za-z0-9._\-]+/gi, "$1[REDACTED]"],
  [
    /("(?:access_token|refresh_token|client_secret|api_secret|password|developer_token)"\s*:\s*")[^"]*(")/gi,
    "$1[REDACTED]$2",
  ],
];

function redactSecretsInString(text: string): string {
  let out = text;
  for (const [pattern, replacement] of STRING_SECRET_PATTERNS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

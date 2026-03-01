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
// McpError
// ---------------------------------------------------------------------------

export class McpError extends Error {
  public readonly code: JsonRpcErrorCode;
  public readonly data?: Record<string, unknown>;

  constructor(
    code: JsonRpcErrorCode,
    message?: string,
    data?: Record<string, unknown>,
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
    data?: Record<string, unknown>;
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

  private static convertToMcpError(error: unknown): McpError {
    if (error instanceof McpError) {
      return error;
    }

    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase();

      if (errorMessage.includes("not found")) {
        return new McpError(JsonRpcErrorCode.NotFound, error.message, undefined, { cause: error });
      }
      if (errorMessage.includes("unauthorized") || errorMessage.includes("authentication")) {
        return new McpError(JsonRpcErrorCode.Unauthorized, error.message, undefined, { cause: error });
      }
      if (errorMessage.includes("forbidden") || errorMessage.includes("permission")) {
        return new McpError(JsonRpcErrorCode.Forbidden, error.message, undefined, { cause: error });
      }
      if (errorMessage.includes("timeout") || errorMessage.includes("timed out")) {
        return new McpError(JsonRpcErrorCode.Timeout, error.message, undefined, { cause: error });
      }
      if (errorMessage.includes("rate limit") || errorMessage.includes("too many requests")) {
        return new McpError(JsonRpcErrorCode.RateLimited, error.message, undefined, { cause: error });
      }
      if (errorMessage.includes("validation") || errorMessage.includes("invalid")) {
        return new McpError(JsonRpcErrorCode.ValidationError, error.message, undefined, { cause: error });
      }

      return new McpError(JsonRpcErrorCode.InternalError, error.message, undefined, { cause: error });
    }

    return new McpError(JsonRpcErrorCode.InternalError, "An unknown error occurred", {
      originalError: String(error),
    });
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
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }
}

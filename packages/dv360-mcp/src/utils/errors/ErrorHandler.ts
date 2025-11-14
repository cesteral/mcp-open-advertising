import type { Logger } from "pino";
import { McpError } from "./McpError.js";
import { JsonRpcErrorCode } from "./errorCodes.js";

/**
 * Error handling context
 */
export interface ErrorContext {
  operation: string;
  context?: Record<string, unknown>;
  input?: unknown;
  requestId?: string;
}

/**
 * Central error handler for consistent error processing
 */
export class ErrorHandler {
  /**
   * Handle error with logging, sanitization, and conversion to McpError
   */
  static handleError(
    error: unknown,
    errorContext: ErrorContext,
    logger?: Logger
  ): McpError {
    // If already an McpError, just log and return
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

    // Convert to McpError
    const mcpError = this.convertToMcpError(error);

    // Log with full context
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
   * Convert unknown error to McpError
   */
  private static convertToMcpError(error: unknown): McpError {
    if (error instanceof McpError) {
      return error;
    }

    if (error instanceof Error) {
      // Detect specific error types and assign appropriate codes
      const errorMessage = error.message.toLowerCase();

      if (errorMessage.includes("not found")) {
        return new McpError(JsonRpcErrorCode.NotFound, error.message, undefined, {
          cause: error,
        });
      }

      if (errorMessage.includes("unauthorized") || errorMessage.includes("authentication")) {
        return new McpError(JsonRpcErrorCode.Unauthorized, error.message, undefined, {
          cause: error,
        });
      }

      if (errorMessage.includes("forbidden") || errorMessage.includes("permission")) {
        return new McpError(JsonRpcErrorCode.Forbidden, error.message, undefined, {
          cause: error,
        });
      }

      if (errorMessage.includes("timeout") || errorMessage.includes("timed out")) {
        return new McpError(JsonRpcErrorCode.Timeout, error.message, undefined, {
          cause: error,
        });
      }

      if (
        errorMessage.includes("rate limit") ||
        errorMessage.includes("too many requests")
      ) {
        return new McpError(JsonRpcErrorCode.RateLimited, error.message, undefined, {
          cause: error,
        });
      }

      if (errorMessage.includes("validation") || errorMessage.includes("invalid")) {
        return new McpError(JsonRpcErrorCode.ValidationError, error.message, undefined, {
          cause: error,
        });
      }

      // Default to internal error
      return new McpError(JsonRpcErrorCode.InternalError, error.message, undefined, {
        cause: error,
      });
    }

    // Unknown error type
    return new McpError(
      JsonRpcErrorCode.InternalError,
      "An unknown error occurred",
      { originalError: String(error) }
    );
  }

  /**
   * Sanitize error data to remove sensitive information
   */
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

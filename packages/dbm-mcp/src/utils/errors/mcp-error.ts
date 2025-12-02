import { JsonRpcErrorCode } from "./error-codes.js";

/**
 * Custom error class for MCP operations
 * Extends Error with JSON-RPC error code and structured data
 */
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

    // Maintain proper stack trace for where error was thrown (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, McpError);
    }

    // Store cause if provided
    if (options?.cause) {
      this.cause = options.cause;
    }
  }

  /**
   * Convert to JSON-RPC error object
   */
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

  /**
   * Create error from unknown error
   */
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

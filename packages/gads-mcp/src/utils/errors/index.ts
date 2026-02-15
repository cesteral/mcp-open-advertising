/**
 * Error handling utilities
 *
 * Core error types (McpError, JsonRpcErrorCode, ErrorHandler) are provided
 * by @cesteral/shared. Re-exported here for convenience.
 */

export {
  McpError,
  ErrorHandler,
  type ErrorContext,
  JsonRpcErrorCode,
  mapErrorCodeToHttpStatus,
} from "@cesteral/shared";

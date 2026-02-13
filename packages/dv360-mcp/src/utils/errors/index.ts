/**
 * Error handling utilities
 *
 * Core error types (McpError, JsonRpcErrorCode, ErrorHandler) are provided
 * by @bidshifter/shared. Re-exported here for convenience.
 */

export {
  McpError,
  ErrorHandler,
  type ErrorContext,
  JsonRpcErrorCode,
  mapErrorCodeToHttpStatus,
} from "@bidshifter/shared";

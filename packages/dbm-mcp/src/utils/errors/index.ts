/**
 * Error handling utilities
 *
 * Core error types (McpError, JsonRpcErrorCode, ErrorHandler) are provided
 * by @cesteral/shared. Domain-specific errors remain in this package.
 */

// Re-export core error types from shared
export {
  McpError,
  ErrorHandler,
  type ErrorContext,
  JsonRpcErrorCode,
  mapErrorCodeToHttpStatus,
} from "@cesteral/shared";

// Bid Manager specific errors
export {
  BidManagerError,
  QueryCreationError,
  QueryExecutionError,
  ReportGenerationError,
  ReportTimeoutError,
  ReportFetchError,
  ReportParseError,
  AuthenticationError,
  CredentialsNotConfiguredError,
  RetryExhaustedError,
} from "./bid-manager-errors.js";

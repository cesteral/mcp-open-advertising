/**
 * Error handling utilities
 * Barrel export for convenient imports
 */

export { McpError } from "./mcp-error.js";
export { ErrorHandler, type ErrorContext } from "./error-handler.js";
export { JsonRpcErrorCode, mapErrorCodeToHttpStatus } from "./error-codes.js";

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

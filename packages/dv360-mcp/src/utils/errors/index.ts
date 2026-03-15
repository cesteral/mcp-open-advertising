// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

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
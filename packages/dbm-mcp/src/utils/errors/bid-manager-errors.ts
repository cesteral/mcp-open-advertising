// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Bid Manager API specific error classes
 *
 * These errors extend McpError for consistent error handling
 * throughout the service layer and tool handlers.
 */

import { McpError, JsonRpcErrorCode } from "@cesteral/shared";

/**
 * Base class for Bid Manager API errors
 */
export class BidManagerError extends McpError {
  public readonly apiErrorCode?: string;
  public readonly httpStatus?: number;

  constructor(
    message: string,
    options?: {
      code?: JsonRpcErrorCode;
      apiErrorCode?: string;
      httpStatus?: number;
      cause?: unknown;
      data?: Record<string, unknown>;
    }
  ) {
    super(options?.code ?? JsonRpcErrorCode.InternalError, message, options?.data, {
      cause: options?.cause,
    });
    this.name = "BidManagerError";
    this.apiErrorCode = options?.apiErrorCode;
    this.httpStatus = options?.httpStatus;
  }
}

/**
 * HTTP status of an upstream failure, read off a gaxios/googleapis error
 * (`status` or `response.status`) or anything in its `cause` chain.
 */
export function upstreamHttpStatus(error: unknown): number | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth++) {
    const e = current as {
      status?: unknown;
      httpStatus?: unknown;
      response?: { status?: unknown };
      cause?: unknown;
    };
    for (const candidate of [e.httpStatus, e.status, e.response?.status]) {
      if (typeof candidate === "number" && candidate >= 100 && candidate <= 599) return candidate;
    }
    current = e.cause;
  }
  return undefined;
}

/** JSON-RPC code that carries the meaning of an upstream HTTP status to the client. */
export function jsonRpcCodeForHttpStatus(status: number | undefined): JsonRpcErrorCode {
  if (status === undefined) return JsonRpcErrorCode.InternalError;
  if (status === 400) return JsonRpcErrorCode.InvalidParams;
  if (status === 401) return JsonRpcErrorCode.Unauthorized;
  if (status === 403) return JsonRpcErrorCode.Forbidden;
  if (status === 404) return JsonRpcErrorCode.NotFound;
  if (status === 409) return JsonRpcErrorCode.Conflict;
  if (status === 429) return JsonRpcErrorCode.RateLimited;
  if (status >= 500) return JsonRpcErrorCode.ServiceUnavailable;
  return JsonRpcErrorCode.InternalError;
}

/**
 * Error when query creation fails
 *
 * Carries the upstream HTTP status (when there was one) both as `httpStatus`
 * and as the JSON-RPC code, so a 400 invalid-query reaches the client as
 * InvalidParams with Google's own message rather than a generic internal error.
 */
export class QueryCreationError extends BidManagerError {
  constructor(message: string, cause?: unknown) {
    const httpStatus = upstreamHttpStatus(cause);
    super(`Failed to create Bid Manager query: ${message}`, {
      code: jsonRpcCodeForHttpStatus(httpStatus),
      httpStatus,
      cause,
      data: httpStatus !== undefined ? { httpStatus } : undefined,
    });
    this.name = "QueryCreationError";
  }
}

/**
 * Error when query execution fails
 */
export class QueryExecutionError extends BidManagerError {
  public readonly queryId: string;

  constructor(queryId: string, message: string, cause?: unknown) {
    const httpStatus = upstreamHttpStatus(cause);
    super(`Failed to execute query ${queryId}: ${message}`, {
      code: jsonRpcCodeForHttpStatus(httpStatus),
      httpStatus,
      cause,
      data: { queryId, ...(httpStatus !== undefined ? { httpStatus } : {}) },
    });
    this.name = "QueryExecutionError";
    this.queryId = queryId;
  }
}

/**
 * Error when report generation fails (state = FAILED)
 */
export class ReportGenerationError extends BidManagerError {
  public readonly queryId: string;
  public readonly reportId: string;
  public readonly failureReason?: string;

  constructor(queryId: string, reportId: string, failureReason?: string, cause?: unknown) {
    super(`Report ${reportId} generation failed: ${failureReason || "Unknown reason"}`, {
      code: JsonRpcErrorCode.InternalError,
      cause,
      data: { queryId, reportId, failureReason },
    });
    this.name = "ReportGenerationError";
    this.queryId = queryId;
    this.reportId = reportId;
    this.failureReason = failureReason;
  }
}

/**
 * Error when fetching report data fails
 */
export class ReportFetchError extends BidManagerError {
  public readonly gcsPath?: string;

  constructor(message: string, gcsPath?: string, cause?: unknown) {
    super(`Failed to fetch report data: ${message}`, {
      code: JsonRpcErrorCode.InternalError,
      cause,
      data: { gcsPath },
    });
    this.name = "ReportFetchError";
    this.gcsPath = gcsPath;
  }
}

/**
 * Error when parsing report CSV/JSON fails
 */
export class ReportParseError extends BidManagerError {
  public readonly format?: string;
  public readonly rowNumber?: number;

  constructor(message: string, options?: { format?: string; rowNumber?: number; cause?: unknown }) {
    super(`Failed to parse report data: ${message}`, {
      code: JsonRpcErrorCode.InternalError,
      cause: options?.cause,
      data: { format: options?.format, rowNumber: options?.rowNumber },
    });
    this.name = "ReportParseError";
    this.format = options?.format;
    this.rowNumber = options?.rowNumber;
  }
}

/**
 * Error when authentication fails
 */
export class AuthenticationError extends BidManagerError {
  constructor(message: string, cause?: unknown) {
    super(`Bid Manager authentication failed: ${message}`, {
      code: JsonRpcErrorCode.Unauthorized,
      cause,
    });
    this.name = "AuthenticationError";
  }
}

/**
 * Error when credentials are not configured
 */
export class CredentialsNotConfiguredError extends BidManagerError {
  constructor() {
    super(
      "Bid Manager API credentials not configured. Set SERVICE_ACCOUNT_JSON or SERVICE_ACCOUNT_FILE.",
      {
        code: JsonRpcErrorCode.Unauthorized,
      }
    );
    this.name = "CredentialsNotConfiguredError";
  }
}

/**
 * Error when all retry attempts are exhausted
 *
 * Thrown after the maximum number of query retries have been attempted
 * without successful completion. Only retryable failures get this far (see
 * `classifyReportError`); the last one's message is part of this error's
 * message and its JSON-RPC code is kept, because `cause` never reaches the
 * client. `Timeout` is used only when the report was still running.
 */
export class RetryExhaustedError extends BidManagerError {
  public readonly queryId?: string;
  public readonly reportId?: string;
  public readonly attemptCount: number;
  public readonly lastError?: Error;

  constructor(
    attemptCount: number,
    options?: {
      queryId?: string;
      reportId?: string;
      lastError?: Error;
      lastStatus?: string;
    }
  ) {
    const queryInfo = options?.queryId ? ` for query ${options.queryId}` : "";
    const statusInfo = options?.lastStatus ? ` (last status: ${options.lastStatus})` : "";
    const lastError = options?.lastError;
    const causeInfo = lastError?.message ? `: ${lastError.message}` : "";
    const code =
      options?.lastStatus === "TIMEOUT"
        ? JsonRpcErrorCode.Timeout
        : lastError instanceof McpError
          ? lastError.code
          : JsonRpcErrorCode.InternalError;

    super(`All ${attemptCount} retry attempts exhausted${queryInfo}${statusInfo}${causeInfo}`, {
      code,
      cause: lastError,
      data: {
        attemptCount,
        queryId: options?.queryId,
        reportId: options?.reportId,
        lastStatus: options?.lastStatus,
        lastErrorMessage: lastError?.message,
        ...(lastError instanceof McpError ? { lastErrorCode: lastError.code } : {}),
      },
    });
    this.name = "RetryExhaustedError";
    this.queryId = options?.queryId;
    this.reportId = options?.reportId;
    this.attemptCount = attemptCount;
    this.lastError = options?.lastError;
  }
}

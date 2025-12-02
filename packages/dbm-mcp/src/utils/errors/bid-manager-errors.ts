/**
 * Bid Manager API specific error classes
 *
 * These errors extend McpError for consistent error handling
 * throughout the service layer and tool handlers.
 */

import { McpError } from "./mcp-error.js";
import { JsonRpcErrorCode } from "./error-codes.js";

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

  /**
   * Create from Google API error response
   */
  static fromGoogleApiError(error: unknown): BidManagerError {
    // Handle Google API error structure
    if (error && typeof error === "object") {
      const apiError = error as {
        code?: number;
        message?: string;
        errors?: Array<{ message?: string; reason?: string }>;
      };

      const httpStatus = apiError.code;
      const message =
        apiError.message ||
        apiError.errors?.[0]?.message ||
        "Unknown Bid Manager API error";
      const apiErrorCode = apiError.errors?.[0]?.reason;

      // Map HTTP status to appropriate JSON-RPC error code
      let jsonRpcCode = JsonRpcErrorCode.InternalError;
      if (httpStatus === 401) {
        jsonRpcCode = JsonRpcErrorCode.Unauthorized;
      } else if (httpStatus === 403) {
        jsonRpcCode = JsonRpcErrorCode.Forbidden;
      } else if (httpStatus === 404) {
        jsonRpcCode = JsonRpcErrorCode.NotFound;
      } else if (httpStatus === 429) {
        jsonRpcCode = JsonRpcErrorCode.RateLimited;
      } else if (httpStatus === 400) {
        jsonRpcCode = JsonRpcErrorCode.InvalidParams;
      }

      return new BidManagerError(message, {
        code: jsonRpcCode,
        httpStatus,
        apiErrorCode,
        cause: error,
        data: { httpStatus, apiErrorCode },
      });
    }

    return new BidManagerError(String(error), { cause: error });
  }
}

/**
 * Error when query creation fails
 */
export class QueryCreationError extends BidManagerError {
  constructor(message: string, cause?: unknown) {
    super(`Failed to create Bid Manager query: ${message}`, {
      code: JsonRpcErrorCode.InternalError,
      cause,
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
    super(`Failed to execute query ${queryId}: ${message}`, {
      code: JsonRpcErrorCode.InternalError,
      cause,
      data: { queryId },
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

  constructor(
    queryId: string,
    reportId: string,
    failureReason?: string,
    cause?: unknown
  ) {
    super(
      `Report ${reportId} generation failed: ${failureReason || "Unknown reason"}`,
      {
        code: JsonRpcErrorCode.InternalError,
        cause,
        data: { queryId, reportId, failureReason },
      }
    );
    this.name = "ReportGenerationError";
    this.queryId = queryId;
    this.reportId = reportId;
    this.failureReason = failureReason;
  }
}

/**
 * Error when polling for report completion times out
 */
export class ReportTimeoutError extends BidManagerError {
  public readonly queryId: string;
  public readonly reportId: string;
  public readonly timeoutMs: number;
  public readonly lastStatus?: string;

  constructor(
    queryId: string,
    reportId: string,
    timeoutMs: number,
    lastStatus?: string
  ) {
    super(
      `Report ${reportId} did not complete within ${timeoutMs}ms. Last status: ${lastStatus || "unknown"}`,
      {
        code: JsonRpcErrorCode.Timeout,
        data: { queryId, reportId, timeoutMs, lastStatus },
      }
    );
    this.name = "ReportTimeoutError";
    this.queryId = queryId;
    this.reportId = reportId;
    this.timeoutMs = timeoutMs;
    this.lastStatus = lastStatus;
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
 * without successful completion.
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

    super(`All ${attemptCount} retry attempts exhausted${queryInfo}${statusInfo}`, {
      code: JsonRpcErrorCode.Timeout,
      cause: options?.lastError,
      data: {
        attemptCount,
        queryId: options?.queryId,
        reportId: options?.reportId,
        lastStatus: options?.lastStatus,
      },
    });
    this.name = "RetryExhaustedError";
    this.queryId = options?.queryId;
    this.reportId = options?.reportId;
    this.attemptCount = attemptCount;
    this.lastError = options?.lastError;
  }
}

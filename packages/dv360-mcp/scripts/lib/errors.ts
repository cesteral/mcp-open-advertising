/**
 * Error handling utilities for schema extraction pipeline
 *
 * Provides structured error types and codes for better debugging and error reporting.
 */

/**
 * Error codes for schema extraction pipeline
 */
export const ErrorCodes = {
  // Discovery document errors
  DISCOVERY_FETCH_FAILED: "DISCOVERY_FETCH_FAILED",
  DISCOVERY_PARSE_FAILED: "DISCOVERY_PARSE_FAILED",
  DISCOVERY_INVALID_FORMAT: "DISCOVERY_INVALID_FORMAT",

  // Schema extraction errors
  SCHEMA_NOT_FOUND: "SCHEMA_NOT_FOUND",
  CIRCULAR_REFERENCE: "CIRCULAR_REFERENCE",
  MAX_DEPTH_EXCEEDED: "MAX_DEPTH_EXCEEDED",
  INVALID_SCHEMA_REF: "INVALID_SCHEMA_REF",
  MISSING_REQUIRED_FIELD: "MISSING_REQUIRED_FIELD",

  // Dependency resolution errors
  DEPENDENCY_NOT_FOUND: "DEPENDENCY_NOT_FOUND",
  DEPENDENCY_CYCLE_DETECTED: "DEPENDENCY_CYCLE_DETECTED",

  // Conversion errors
  CONVERSION_FAILED: "CONVERSION_FAILED",
  UNSUPPORTED_SCHEMA_TYPE: "UNSUPPORTED_SCHEMA_TYPE",
  INVALID_OPENAPI_OUTPUT: "INVALID_OPENAPI_OUTPUT",

  // File system errors
  FILE_WRITE_FAILED: "FILE_WRITE_FAILED",
  FILE_READ_FAILED: "FILE_READ_FAILED",
  DIRECTORY_CREATE_FAILED: "DIRECTORY_CREATE_FAILED",

  // Cache errors
  CACHE_READ_FAILED: "CACHE_READ_FAILED",
  CACHE_WRITE_FAILED: "CACHE_WRITE_FAILED",
  CACHE_EXPIRED: "CACHE_EXPIRED",

  // Validation errors
  CONFIG_VALIDATION_FAILED: "CONFIG_VALIDATION_FAILED",
  SCHEMA_VALIDATION_FAILED: "SCHEMA_VALIDATION_FAILED",
  SIZE_THRESHOLD_EXCEEDED: "SIZE_THRESHOLD_EXCEEDED",
  SIZE_LIMIT_EXCEEDED: "SIZE_LIMIT_EXCEEDED",

  // Code generation errors
  CODEGEN_FAILED: "CODEGEN_FAILED",
  TYPESCRIPT_GENERATION_FAILED: "TYPESCRIPT_GENERATION_FAILED",
  ZOD_GENERATION_FAILED: "ZOD_GENERATION_FAILED",

  // Generic errors
  UNKNOWN_ERROR: "UNKNOWN_ERROR",
  INVALID_ARGUMENT: "INVALID_ARGUMENT",
  OPERATION_TIMEOUT: "OPERATION_TIMEOUT",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/**
 * Structured error class for schema extraction operations
 */
export class ExtractionError extends Error {
  /**
   * Error code for programmatic handling
   */
  readonly code: ErrorCode;

  /**
   * Additional context details about the error
   */
  readonly details?: Record<string, any>;

  /**
   * Original error that caused this error (if applicable)
   */
  readonly cause?: Error;

  constructor(message: string, code: ErrorCode, details?: Record<string, any>, cause?: Error) {
    super(message);
    this.name = "ExtractionError";
    this.code = code;
    this.details = details;
    this.cause = cause;

    // Maintains proper stack trace for where error was thrown (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ExtractionError);
    }
  }

  /**
   * Convert error to JSON for logging/reporting
   */
  toJSON(): Record<string, any> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      details: this.details,
      stack: this.stack,
      cause: this.cause
        ? {
            name: this.cause.name,
            message: this.cause.message,
            stack: this.cause.stack,
          }
        : undefined,
    };
  }

  /**
   * Format error for console output
   */
  toString(): string {
    let result = `${this.name} [${this.code}]: ${this.message}`;

    if (this.details) {
      result += `\nDetails: ${JSON.stringify(this.details, null, 2)}`;
    }

    if (this.cause) {
      result += `\nCaused by: ${this.cause.message}`;
    }

    return result;
  }
}

/**
 * Helper function to create ExtractionError from unknown error
 */
export function toExtractionError(
  error: unknown,
  code: ErrorCode = ErrorCodes.UNKNOWN_ERROR,
  details?: Record<string, any>
): ExtractionError {
  if (error instanceof ExtractionError) {
    return error;
  }

  if (error instanceof Error) {
    return new ExtractionError(error.message, code, details, error);
  }

  return new ExtractionError(String(error), code, details);
}

/**
 * Helper function to check if error is an ExtractionError with specific code
 */
export function isExtractionError(error: unknown, code?: ErrorCode): error is ExtractionError {
  if (!(error instanceof ExtractionError)) {
    return false;
  }

  if (code !== undefined) {
    return error.code === code;
  }

  return true;
}

/**
 * Helper function to create schema not found error
 */
export function schemaNotFoundError(
  schemaName: string,
  availableSchemas?: string[]
): ExtractionError {
  return new ExtractionError(
    `Schema "${schemaName}" not found in Discovery document`,
    ErrorCodes.SCHEMA_NOT_FOUND,
    {
      schemaName,
      availableSchemas: availableSchemas?.slice(0, 10), // Limit to first 10 for readability
      totalAvailable: availableSchemas?.length,
    }
  );
}

/**
 * Helper function to create circular reference error
 */
export function circularReferenceError(
  schemaPath: string[],
  circularSchema: string
): ExtractionError {
  return new ExtractionError(
    `Circular reference detected: ${circularSchema}`,
    ErrorCodes.CIRCULAR_REFERENCE,
    {
      schemaPath,
      circularSchema,
      pathString: schemaPath.join(" -> "),
    }
  );
}

/**
 * Helper function to create max depth exceeded error
 */
export function maxDepthExceededError(
  currentDepth: number,
  maxDepth: number,
  schemaPath: string[]
): ExtractionError {
  return new ExtractionError(
    `Maximum depth ${maxDepth} exceeded at depth ${currentDepth}`,
    ErrorCodes.MAX_DEPTH_EXCEEDED,
    {
      currentDepth,
      maxDepth,
      schemaPath,
      pathString: schemaPath.join(" -> "),
    }
  );
}

/**
 * Helper function to create discovery fetch error
 */
export function discoveryFetchError(
  url: string,
  statusCode?: number,
  cause?: Error
): ExtractionError {
  return new ExtractionError(
    `Failed to fetch Discovery document from ${url}`,
    ErrorCodes.DISCOVERY_FETCH_FAILED,
    {
      url,
      statusCode,
    },
    cause
  );
}

/**
 * Helper function to create file operation error
 */
export function fileOperationError(
  operation: "read" | "write" | "create",
  filePath: string,
  cause?: Error
): ExtractionError {
  const codeMap = {
    read: ErrorCodes.FILE_READ_FAILED,
    write: ErrorCodes.FILE_WRITE_FAILED,
    create: ErrorCodes.DIRECTORY_CREATE_FAILED,
  };

  return new ExtractionError(
    `Failed to ${operation} file: ${filePath}`,
    codeMap[operation],
    { filePath, operation },
    cause
  );
}

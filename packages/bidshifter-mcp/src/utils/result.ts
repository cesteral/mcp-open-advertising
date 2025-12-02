/**
 * Result type pattern for explicit error handling
 *
 * Provides a type-safe way to handle operations that can fail,
 * avoiding try/catch and enabling easier error propagation.
 */

/**
 * Error types for categorizing failures
 */
export type ErrorType =
  | "validation"
  | "calculation"
  | "api"
  | "timeout"
  | "authentication"
  | "not_found"
  | "rate_limit"
  | "unknown";

/**
 * Typed error with category and details
 */
export interface TypedError {
  type: ErrorType;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Success result containing data
 */
export interface Success<T> {
  success: true;
  data: T;
}

/**
 * Failure result containing error
 */
export interface Failure {
  success: false;
  error: TypedError;
}

/**
 * Result type - either Success with data or Failure with error
 */
export type Result<T> = Success<T> | Failure;

/**
 * Creates a success result with data
 *
 * @param data - The successful result data
 * @returns Success result
 */
export const createSuccess = <T>(data: T): Success<T> => ({
  success: true,
  data,
});

/**
 * Creates a failure result with typed error
 *
 * @param type - Error category
 * @param message - Human-readable error message
 * @param details - Optional additional error context
 * @returns Failure result
 */
export const createError = (
  type: ErrorType,
  message: string,
  details?: Record<string, unknown>
): Failure => ({
  success: false,
  error: { type, message, details },
});

/**
 * Type guard to check if a result is successful
 *
 * @param result - The result to check
 * @returns True if result is successful
 */
export const isSuccess = <T>(result: Result<T>): result is Success<T> => {
  return result.success === true;
};

/**
 * Type guard to check if a result is a failure
 *
 * @param result - The result to check
 * @returns True if result is a failure
 */
export const isFailure = <T>(result: Result<T>): result is Failure => {
  return result.success === false;
};

/**
 * Maps a successful result to a new value
 *
 * @param result - The result to map
 * @param fn - Function to transform the data
 * @returns New result with transformed data or original failure
 */
export const mapResult = <T, U>(result: Result<T>, fn: (data: T) => U): Result<U> => {
  if (isSuccess(result)) {
    return createSuccess(fn(result.data));
  }
  return result;
};

/**
 * Chains result operations (flatMap)
 *
 * @param result - The result to chain
 * @param fn - Function returning a new Result
 * @returns New result or original failure
 */
export const chainResult = <T, U>(
  result: Result<T>,
  fn: (data: T) => Result<U>
): Result<U> => {
  if (isSuccess(result)) {
    return fn(result.data);
  }
  return result;
};

/**
 * Unwraps a result, returning the data or a default value
 *
 * @param result - The result to unwrap
 * @param defaultValue - Default value if result is a failure
 * @returns The data or default value
 */
export const unwrapOr = <T>(result: Result<T>, defaultValue: T): T => {
  return isSuccess(result) ? result.data : defaultValue;
};

/**
 * Unwraps a result, throwing an error if it's a failure
 *
 * @param result - The result to unwrap
 * @returns The data
 * @throws Error if result is a failure
 */
export const unwrap = <T>(result: Result<T>): T => {
  if (isSuccess(result)) {
    return result.data;
  }
  throw new Error(`${result.error.type}: ${result.error.message}`);
};

/**
 * Wraps a potentially throwing function in a Result
 *
 * @param fn - Function that might throw
 * @returns Result containing the return value or error
 */
export const tryCatch = <T>(fn: () => T): Result<T> => {
  try {
    return createSuccess(fn());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return createError("unknown", message, { originalError: error });
  }
};

/**
 * Wraps an async potentially throwing function in a Result
 *
 * @param fn - Async function that might throw
 * @returns Promise of Result containing the return value or error
 */
export const tryCatchAsync = async <T>(fn: () => Promise<T>): Promise<Result<T>> => {
  try {
    const data = await fn();
    return createSuccess(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return createError("unknown", message, { originalError: error });
  }
};

/**
 * Combines multiple results into a single result containing an array
 * Returns first failure encountered, or success with all data
 *
 * @param results - Array of results to combine
 * @returns Combined result
 */
export const combineResults = <T>(results: Result<T>[]): Result<T[]> => {
  const data: T[] = [];

  for (const result of results) {
    if (isFailure(result)) {
      return result;
    }
    data.push(result.data);
  }

  return createSuccess(data);
};

/**
 * Common shared types used throughout the application
 */

/**
 * Generic success/failure result type
 */
export interface Result<T, E = Error> {
  success: boolean;
  data?: T;
  error?: E;
}

/**
 * Pagination parameters
 */
export interface PaginationParams {
  pageToken?: string;
  pageSize?: number;
}

/**
 * Paginated response
 */
export interface PaginatedResponse<T> {
  items: T[];
  nextPageToken?: string;
  totalCount?: number;
}

/**
 * Date range
 */
export interface DateRange {
  startDate: string; // ISO 8601 or YYYY-MM-DD
  endDate: string; // ISO 8601 or YYYY-MM-DD
}

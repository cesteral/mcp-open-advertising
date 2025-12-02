/**
 * BigQuery Module
 *
 * Provides feedback storage for pacing optimization:
 * - BigQueryService: Low-level BigQuery operations
 * - FeedbackRepository: High-level feedback storage API
 */

export { BigQueryService, type BigQueryClient } from "./BigQueryService.js";
export { FeedbackRepository } from "./FeedbackRepository.js";
export type {
  BigQueryConfig,
  StoredFeedbackRecord,
  SaveFeedbackInput,
  UpdateFeedbackInput,
  FeedbackQueryOptions,
  QueryResult,
} from "./types.js";

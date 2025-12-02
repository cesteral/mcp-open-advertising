/**
 * Types for BigQuery feedback storage
 */

import type { AdjustmentFeedback, AdjustmentType } from "../pacing/types.js";

/**
 * BigQuery configuration
 */
export interface BigQueryConfig {
  projectId: string;
  dataset: string;
  feedbackTable: string;
  location?: string;
}

/**
 * Stored feedback record with additional metadata
 */
export interface StoredFeedbackRecord {
  /** Unique record ID */
  id: string;
  /** Line item ID */
  lineItemId: string;
  /** Advertiser ID for partitioning */
  advertiserId: string;
  /** Campaign ID for filtering */
  campaignId: string;
  /** Date of the adjustment (YYYY-MM-DD) */
  adjustmentDate: string;
  /** The factor that was applied */
  adjustmentFactor: number;
  /** Type of adjustment (cpm or markup) */
  adjustmentType: AdjustmentType;
  /** Pacing ratio before adjustment */
  pacingBefore: number;
  /** Pacing ratio after adjustment (observed next day) */
  pacingAfter: number | null;
  /** Calculated effectiveness score (-1 to 1) */
  effectiveness: number | null;
  /** Timestamp when record was created */
  createdAt: string;
  /** Timestamp when record was last updated */
  updatedAt: string;
}

/**
 * Input for saving feedback
 */
export interface SaveFeedbackInput {
  lineItemId: string;
  advertiserId: string;
  campaignId: string;
  feedback: AdjustmentFeedback;
}

/**
 * Input for updating feedback with observed pacing
 */
export interface UpdateFeedbackInput {
  lineItemId: string;
  adjustmentDate: string;
  pacingAfter: number;
  effectiveness: number;
}

/**
 * Query options for retrieving feedback
 */
export interface FeedbackQueryOptions {
  lineItemId?: string;
  advertiserId?: string;
  campaignId?: string;
  adjustmentType?: AdjustmentType;
  startDate?: string;
  endDate?: string;
  limit?: number;
}

/**
 * BigQuery query result
 */
export interface QueryResult<T> {
  rows: T[];
  totalRows: number;
}

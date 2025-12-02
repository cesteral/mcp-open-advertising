/**
 * FeedbackRepository - Storage for pacing adjustment feedback
 *
 * Handles persistence of adjustment feedback data for the learning loop:
 * - Save new adjustment feedback when adjustments are made
 * - Update feedback with observed pacing results the next day
 * - Query historical feedback for analysis
 * - Get the most recent feedback for a line item
 */

import { injectable, inject } from "tsyringe";
import type { Logger } from "pino";
import * as Tokens from "../../container/tokens.js";
import { BigQueryService } from "./BigQueryService.js";
import type {
  BigQueryConfig,
  StoredFeedbackRecord,
  SaveFeedbackInput,
  UpdateFeedbackInput,
  FeedbackQueryOptions,
} from "./types.js";
import type { AdjustmentFeedback } from "../pacing/types.js";
import { createSuccess, createError, type Result } from "../../utils/result.js";

/**
 * Generate a unique ID for feedback records
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

@injectable()
export class FeedbackRepository {
  private readonly tableName: string;

  constructor(
    @inject(Tokens.Logger) private logger: Logger,
    @inject(Tokens.BigQueryService) private bigQueryService: BigQueryService,
    @inject(Tokens.BigQueryConfig) config: BigQueryConfig
  ) {
    this.tableName = config.feedbackTable;
  }

  /**
   * Save new adjustment feedback
   *
   * @param input - Feedback data to save
   * @returns Result with the saved record ID
   */
  async saveFeedback(input: SaveFeedbackInput): Promise<Result<string>> {
    const { lineItemId, advertiserId, campaignId, feedback } = input;

    try {
      const id = generateId();
      const now = new Date().toISOString();

      const record: StoredFeedbackRecord = {
        id,
        lineItemId,
        advertiserId,
        campaignId,
        adjustmentDate: feedback.date,
        adjustmentFactor: feedback.adjustmentFactor,
        adjustmentType: feedback.adjustmentType,
        pacingBefore: feedback.pacingBefore,
        pacingAfter: feedback.pacingAfter ?? null,
        effectiveness: feedback.effectiveness ?? null,
        createdAt: now,
        updatedAt: now,
      };

      await this.bigQueryService.insert(this.tableName, [record as unknown as Record<string, unknown>]);

      this.logger.info(
        { id, lineItemId, adjustmentDate: feedback.date, adjustmentType: feedback.adjustmentType },
        "Feedback saved successfully"
      );

      return createSuccess(id);
    } catch (error) {
      this.logger.error({ error, lineItemId }, "Failed to save feedback");
      return createError("api", "Failed to save feedback to BigQuery", {
        lineItemId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Update feedback with observed pacing result
   *
   * Called the day after an adjustment to record the actual pacing change
   * and calculate effectiveness.
   *
   * @param input - Update data with observed pacing
   * @returns Result indicating success or failure
   */
  async updateFeedbackWithResult(input: UpdateFeedbackInput): Promise<Result<void>> {
    const { lineItemId, adjustmentDate, pacingAfter, effectiveness } = input;

    try {
      const updatedCount = await this.bigQueryService.update(
        this.tableName,
        {
          pacingAfter,
          effectiveness,
          updatedAt: new Date().toISOString(),
        },
        "lineItemId = @lineItemId AND adjustmentDate = @adjustmentDate",
        { lineItemId, adjustmentDate }
      );

      this.logger.info({ lineItemId, adjustmentDate, updatedCount, pacingAfter, effectiveness }, "Feedback updated with result");

      return createSuccess(undefined);
    } catch (error) {
      this.logger.error({ error, lineItemId, adjustmentDate }, "Failed to update feedback");
      return createError("api", "Failed to update feedback in BigQuery", {
        lineItemId,
        adjustmentDate,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get the most recent feedback for a line item
   *
   * Used to provide previousAdjustment data to the pacing calculation
   *
   * @param lineItemId - Line item to get feedback for
   * @returns Result with the most recent feedback or null
   */
  async getLatestFeedback(lineItemId: string): Promise<Result<AdjustmentFeedback | null>> {
    try {
      const sql = `
        SELECT
          adjustmentDate as date,
          adjustmentFactor,
          adjustmentType,
          pacingBefore,
          pacingAfter,
          effectiveness
        FROM \`${this.bigQueryService.getFullTableName(this.tableName)}\`
        WHERE lineItemId = @lineItemId
        ORDER BY adjustmentDate DESC
        LIMIT 1
      `;

      const result = await this.bigQueryService.query<StoredFeedbackRecord>(sql, { lineItemId });

      if (result.rows.length === 0) {
        return createSuccess(null);
      }

      const row = result.rows[0];
      const feedback: AdjustmentFeedback = {
        date: row.adjustmentDate,
        adjustmentFactor: row.adjustmentFactor,
        adjustmentType: row.adjustmentType,
        pacingBefore: row.pacingBefore,
        pacingAfter: row.pacingAfter ?? undefined,
        effectiveness: row.effectiveness ?? undefined,
      };

      this.logger.debug({ lineItemId, date: feedback.date }, "Latest feedback retrieved");

      return createSuccess(feedback);
    } catch (error) {
      this.logger.error({ error, lineItemId }, "Failed to get latest feedback");
      return createError("api", "Failed to query feedback from BigQuery", {
        lineItemId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get feedback history for analysis
   *
   * @param options - Query options for filtering
   * @returns Result with array of feedback records
   */
  async getFeedbackHistory(options: FeedbackQueryOptions): Promise<Result<AdjustmentFeedback[]>> {
    try {
      const conditions: string[] = [];
      const params: Record<string, unknown> = {};

      if (options.lineItemId) {
        conditions.push("lineItemId = @lineItemId");
        params.lineItemId = options.lineItemId;
      }

      if (options.advertiserId) {
        conditions.push("advertiserId = @advertiserId");
        params.advertiserId = options.advertiserId;
      }

      if (options.campaignId) {
        conditions.push("campaignId = @campaignId");
        params.campaignId = options.campaignId;
      }

      if (options.adjustmentType) {
        conditions.push("adjustmentType = @adjustmentType");
        params.adjustmentType = options.adjustmentType;
      }

      if (options.startDate) {
        conditions.push("adjustmentDate >= @startDate");
        params.startDate = options.startDate;
      }

      if (options.endDate) {
        conditions.push("adjustmentDate <= @endDate");
        params.endDate = options.endDate;
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      const limit = options.limit || 100;

      const sql = `
        SELECT
          adjustmentDate as date,
          adjustmentFactor,
          adjustmentType,
          pacingBefore,
          pacingAfter,
          effectiveness
        FROM \`${this.bigQueryService.getFullTableName(this.tableName)}\`
        ${whereClause}
        ORDER BY adjustmentDate DESC
        LIMIT ${limit}
      `;

      const result = await this.bigQueryService.query<StoredFeedbackRecord>(sql, params);

      const feedback: AdjustmentFeedback[] = result.rows.map((row) => ({
        date: row.adjustmentDate,
        adjustmentFactor: row.adjustmentFactor,
        adjustmentType: row.adjustmentType,
        pacingBefore: row.pacingBefore,
        pacingAfter: row.pacingAfter ?? undefined,
        effectiveness: row.effectiveness ?? undefined,
      }));

      this.logger.debug({ options, count: feedback.length }, "Feedback history retrieved");

      return createSuccess(feedback);
    } catch (error) {
      this.logger.error({ error, options }, "Failed to get feedback history");
      return createError("api", "Failed to query feedback history from BigQuery", {
        options,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get pending feedback records that need pacing result updates
   *
   * Returns records where pacingAfter is null and the adjustment
   * was made at least 1 day ago.
   *
   * @param options - Query options
   * @returns Result with array of records needing updates
   */
  async getPendingFeedbackUpdates(options?: { advertiserId?: string; limit?: number }): Promise<Result<StoredFeedbackRecord[]>> {
    try {
      const conditions: string[] = ["pacingAfter IS NULL", "adjustmentDate < CURRENT_DATE()"];
      const params: Record<string, unknown> = {};

      if (options?.advertiserId) {
        conditions.push("advertiserId = @advertiserId");
        params.advertiserId = options.advertiserId;
      }

      const limit = options?.limit || 1000;

      const sql = `
        SELECT *
        FROM \`${this.bigQueryService.getFullTableName(this.tableName)}\`
        WHERE ${conditions.join(" AND ")}
        ORDER BY adjustmentDate ASC
        LIMIT ${limit}
      `;

      const result = await this.bigQueryService.query<StoredFeedbackRecord>(sql, params);

      this.logger.debug({ count: result.rows.length }, "Pending feedback updates retrieved");

      return createSuccess(result.rows);
    } catch (error) {
      this.logger.error({ error }, "Failed to get pending feedback updates");
      return createError("api", "Failed to query pending feedback from BigQuery", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Calculate aggregate effectiveness statistics
   *
   * @param options - Query options for filtering
   * @returns Result with effectiveness statistics
   */
  async getEffectivenessStats(options?: FeedbackQueryOptions): Promise<
    Result<{
      totalAdjustments: number;
      avgEffectiveness: number;
      positiveAdjustments: number;
      negativeAdjustments: number;
    }>
  > {
    try {
      const conditions: string[] = ["effectiveness IS NOT NULL"];
      const params: Record<string, unknown> = {};

      if (options?.lineItemId) {
        conditions.push("lineItemId = @lineItemId");
        params.lineItemId = options.lineItemId;
      }

      if (options?.advertiserId) {
        conditions.push("advertiserId = @advertiserId");
        params.advertiserId = options.advertiserId;
      }

      if (options?.campaignId) {
        conditions.push("campaignId = @campaignId");
        params.campaignId = options.campaignId;
      }

      if (options?.startDate) {
        conditions.push("adjustmentDate >= @startDate");
        params.startDate = options.startDate;
      }

      if (options?.endDate) {
        conditions.push("adjustmentDate <= @endDate");
        params.endDate = options.endDate;
      }

      const sql = `
        SELECT
          COUNT(*) as totalAdjustments,
          AVG(effectiveness) as avgEffectiveness,
          COUNTIF(effectiveness > 0) as positiveAdjustments,
          COUNTIF(effectiveness < 0) as negativeAdjustments
        FROM \`${this.bigQueryService.getFullTableName(this.tableName)}\`
        WHERE ${conditions.join(" AND ")}
      `;

      const result = await this.bigQueryService.query<{
        totalAdjustments: number;
        avgEffectiveness: number;
        positiveAdjustments: number;
        negativeAdjustments: number;
      }>(sql, params);

      if (result.rows.length === 0) {
        return createSuccess({
          totalAdjustments: 0,
          avgEffectiveness: 0,
          positiveAdjustments: 0,
          negativeAdjustments: 0,
        });
      }

      return createSuccess(result.rows[0]);
    } catch (error) {
      this.logger.error({ error }, "Failed to get effectiveness stats");
      return createError("api", "Failed to query effectiveness stats from BigQuery", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

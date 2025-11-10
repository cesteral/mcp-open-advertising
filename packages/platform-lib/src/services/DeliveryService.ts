import type {
  DeliveryMetrics,
  PerformanceMetrics,
  TimeSeriesDataPoint,
  PacingStatus,
  DateRange,
} from "@bidshifter/shared";

/**
 * Service for fetching delivery metrics and performance data
 * This is a stub implementation - actual BigQuery integration to be added later
 */
export class DeliveryService {
  /**
   * Get delivery metrics for a campaign within a date range
   */
  async getCampaignDelivery(
    _campaignId: string,
    _dateRange: DateRange
  ): Promise<DeliveryMetrics> {
    // TODO: Implement BigQuery query for delivery metrics
    throw new Error("Not implemented");
  }

  /**
   * Calculate performance metrics (KPIs) from delivery data
   */
  async getPerformanceMetrics(
    _campaignId: string,
    _dateRange: DateRange
  ): Promise<PerformanceMetrics> {
    // TODO: Implement performance calculations
    throw new Error("Not implemented");
  }

  /**
   * Get time-series historical metrics
   */
  async getHistoricalMetrics(
    _campaignId: string,
    _dateRange: DateRange,
    _granularity: "daily" | "hourly" = "daily"
  ): Promise<TimeSeriesDataPoint[]> {
    // TODO: Implement time-series data query
    throw new Error("Not implemented");
  }

  /**
   * Get pacing status for a campaign
   */
  async getPacingStatus(_campaignId: string): Promise<PacingStatus> {
    // TODO: Implement pacing calculations
    throw new Error("Not implemented");
  }

  /**
   * Get multiple campaigns' pacing status
   */
  async getBatchPacingStatus(_campaignIds: string[]): Promise<PacingStatus[]> {
    // TODO: Implement batch pacing query
    throw new Error("Not implemented");
  }
}

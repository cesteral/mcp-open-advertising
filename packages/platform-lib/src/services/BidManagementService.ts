import type { EntityStatus } from "@bidshifter/shared";

export interface BudgetUpdate {
  campaignId: string;
  budgetMicros: number;
}

export interface DateUpdate {
  campaignId: string;
  startDate: string;
  endDate: string;
}

export interface StatusUpdate {
  lineItemId: string;
  status: EntityStatus;
}

export interface BidUpdate {
  lineItemId: string;
  bidAmountMicros: number;
}

export interface MarginUpdate {
  lineItemId: string;
  marginPercent: number;
}

/**
 * Service for managing bids, budgets, and campaign settings
 * This is a stub implementation - actual DV360/platform API integration to be added later
 */
export class BidManagementService {
  /**
   * Update campaign budget
   */
  async updateCampaignBudget(_update: BudgetUpdate): Promise<void> {
    // TODO: Implement SDF/API budget update
    throw new Error("Not implemented");
  }

  /**
   * Update campaign flight dates
   */
  async updateCampaignDates(_update: DateUpdate): Promise<void> {
    // TODO: Implement SDF/API date update
    throw new Error("Not implemented");
  }

  /**
   * Update line item status (active/paused)
   */
  async updateLineItemStatus(_update: StatusUpdate): Promise<void> {
    // TODO: Implement SDF/API status update
    throw new Error("Not implemented");
  }

  /**
   * Update line item bid amount
   */
  async updateLineItemBid(_update: BidUpdate): Promise<void> {
    // TODO: Implement SDF/API bid update
    throw new Error("Not implemented");
  }

  /**
   * Update revenue margin for margin-based line items
   */
  async updateRevenueMargin(_update: MarginUpdate): Promise<void> {
    // TODO: Implement SDF/API margin update
    throw new Error("Not implemented");
  }

  /**
   * Batch update multiple line item bids
   */
  async batchUpdateBids(_updates: BidUpdate[]): Promise<void> {
    // TODO: Implement batch SDF update
    throw new Error("Not implemented");
  }

  /**
   * Batch update multiple revenue margins
   */
  async batchUpdateMargins(_updates: MarginUpdate[]): Promise<void> {
    // TODO: Implement batch SDF update
    throw new Error("Not implemented");
  }
}

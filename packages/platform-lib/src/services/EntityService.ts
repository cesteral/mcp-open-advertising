import type {
  Advertiser,
  Campaign,
  LineItem,
  CampaignHierarchy,
  Platform,
} from "@bidshifter/shared";

/**
 * Service for fetching campaign entities and hierarchies
 * This is a stub implementation - actual platform API integration to be added later
 */
export class EntityService {
  /**
   * Get all advertisers for a platform
   */
  async getAdvertisers(_platform: Platform): Promise<Advertiser[]> {
    // TODO: Implement platform API query
    throw new Error("Not implemented");
  }

  /**
   * Get campaigns for an advertiser
   */
  async getCampaigns(_advertiserId: string): Promise<Campaign[]> {
    // TODO: Implement platform API query
    throw new Error("Not implemented");
  }

  /**
   * Get line items for a campaign
   */
  async getLineItems(_campaignId: string): Promise<LineItem[]> {
    // TODO: Implement platform API query
    throw new Error("Not implemented");
  }

  /**
   * Get full campaign hierarchy (advertiser → campaigns → line items)
   */
  async getCampaignHierarchy(_advertiserId: string): Promise<CampaignHierarchy> {
    // TODO: Implement platform API query with nested structure
    throw new Error("Not implemented");
  }

  /**
   * Get a single campaign by ID
   */
  async getCampaign(_campaignId: string): Promise<Campaign> {
    // TODO: Implement platform API query
    throw new Error("Not implemented");
  }

  /**
   * Get a single line item by ID
   */
  async getLineItem(_lineItemId: string): Promise<LineItem> {
    // TODO: Implement platform API query
    throw new Error("Not implemented");
  }
}

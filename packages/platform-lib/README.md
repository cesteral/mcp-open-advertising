# @bidshifter/platform-lib

Shared business logic and services for BidShifter MCP servers. This library provides platform-agnostic service implementations that can be used directly by all MCP servers for zero-overhead internal calls.

## Architecture

This library implements the **Hybrid Communication Pattern**:
- **External consumers** (AI agents): Call MCP servers via HTTP/MCP protocol
- **Internal optimization** (bidshifter-mcp): Uses this library directly for zero-overhead calls
- **Performance benefit**: Saves 2.6-6.1 seconds per optimization by avoiding 50+ HTTP round trips

## Contents

### Services (`/services`)

**DeliveryService**
- `getCampaignDelivery()` - Fetch delivery metrics
- `getPerformanceMetrics()` - Calculate KPIs
- `getHistoricalMetrics()` - Time-series data
- `getPacingStatus()` - Real-time pacing calculations

**BidManagementService**
- `updateCampaignBudget()` - Update budget via SDF/API
- `updateCampaignDates()` - Update flight dates
- `updateLineItemStatus()` - Pause/activate line items
- `updateLineItemBid()` - Adjust bids
- `updateRevenueMargin()` - Optimize margins

**EntityService**
- `getAdvertisers()` - Fetch advertisers
- `getCampaigns()` - Fetch campaigns
- `getLineItems()` - Fetch line items
- `getCampaignHierarchy()` - Get full advertiser → campaigns → line items tree

### Adapters (`/adapters`)

Platform-specific adapters (to be implemented):
- `dv360/` - DV360 API integration
- `google-ads/` - Google Ads API integration
- `meta/` - Meta Marketing API integration
- `ttd/` - The Trade Desk integration
- `amazon/` - Amazon DSP integration

## Current Status

**Phase: Scaffolding**

All services are stubs that throw `"Not implemented"` errors. Actual implementations will be added in future phases:
1. BigQuery integration for DeliveryService
2. DV360 SDF/API integration for BidManagementService
3. Platform API integrations for EntityService

## Usage

```typescript
import { DeliveryService, BidManagementService, EntityService } from "@bidshifter/platform-lib";

const deliveryService = new DeliveryService();
const bidService = new BidManagementService();
const entityService = new EntityService();

// Get delivery metrics
const metrics = await deliveryService.getCampaignDelivery(campaignId, dateRange);

// Update bid
await bidService.updateLineItemBid({ lineItemId, bidAmountMicros });

// Get campaign hierarchy
const hierarchy = await entityService.getCampaignHierarchy(advertiserId);
```

## Development

```bash
# Build
pnpm run build

# Type check
pnpm run typecheck

# Lint
pnpm run lint

# Test
pnpm run test
```

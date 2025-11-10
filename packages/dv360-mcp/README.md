# @bidshifter/dv360-mcp

DV360 MCP Server - Campaign entity management and configuration.

## Purpose

Management server for DV360 campaign entities. Handles CRUD operations including budget updates, flight date changes, line item status, bids, and revenue margins via SDF and DV360 API.

## MCP Tools (To Be Implemented)

1. `fetch_campaign_entities` - Get campaign hierarchy
2. `update_campaign_budget` - Change campaign budget
3. `update_campaign_dates` - Adjust flight dates
4. `update_line_item_status` - Pause/activate line items
5. `update_line_item_bid` - Change CPM/CPC bids
6. `update_revenue_margin` - Adjust revenue margins

## Current Status

**Phase: Scaffolding - Stub Implementation Only**

Server starts and responds to health checks. Full MCP tool implementation pending.

## Development

```bash
pnpm run dev:http    # Start development server
pnpm run build       # Build TypeScript
pnpm run typecheck   # Type checking
```

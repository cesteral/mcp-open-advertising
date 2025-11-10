# @bidshifter/bidshifter-mcp

BidShifter MCP Server - Optimization intelligence and orchestration.

## Purpose

Platform-agnostic optimization server that analyzes pacing, calculates bid adjustments, optimizes revenue margins, and orchestrates calls to dbm-mcp and dv360-mcp servers using the shared platform-lib.

## MCP Tools (To Be Implemented)

1. `optimize_campaign_bids` - Analyze and adjust bids based on pacing
2. `adjust_revenue_margin` - Optimize revenue margins
3. `get_optimization_recommendations` - Get recommendations (dry-run mode)
4. `get_adjustment_history` - Track historical adjustments
5. `get_pacing_forecast` - Project future delivery
6. `configure_optimization` - Set strategy and thresholds

## MCP Prompts (To Be Implemented)

1. `campaign_optimization_workflow` - Step-by-step optimization guide
2. `troubleshoot_underdelivery` - Diagnostic workflow for underdelivery
3. `margin_optimization_strategy` - Margin optimization guidance

## Scheduled Functions (To Be Implemented)

1. `data-sync` - Sync data every 4 hours
2. `optimization-scan` - Scan and recommend every 4 hours
3. `adjustment-executor` - Execute adjustments every 30 minutes
4. `outcome-tracker` - Track outcomes daily

## Current Status

**Phase: Scaffolding - Stub Implementation Only**

Server starts and responds to health checks. Full MCP tool and scheduled function implementation pending.

## Development

```bash
pnpm run dev:http    # Start development server
pnpm run build       # Build TypeScript
pnpm run typecheck   # Type checking
```

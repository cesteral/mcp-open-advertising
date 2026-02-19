# Bulk Operations Learnings

Insights about batch and bulk operations across platforms.

## Respect platform batch limits
- **Date**: 2026-02-19
- **Source**: API documentation
- **Context**: Each platform has different batch size limits. TTD allows up to 50 items per bulk call. Google Ads bulk_mutate can handle larger batches but performance degrades above 100 operations.
- **Recommendation**: Stay within documented limits. For Google Ads, keep bulk operations under 100 items. The evaluator flags operations exceeding this threshold.
- **Applies to**: ttd-mcp, gads-mcp, bulk operation tools

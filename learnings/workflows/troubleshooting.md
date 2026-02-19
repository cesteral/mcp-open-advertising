# Troubleshooting Learnings

Common troubleshooting patterns across platforms.

## Check pacing before adjusting bids
- **Date**: 2026-02-19
- **Source**: Workflow design
- **Context**: When a campaign is underdelivering, always check pacing data first to understand the magnitude of the issue before making bid adjustments. Blind bid increases can cause overspend.
- **Recommendation**: Use `get_pacing_status` (dbm-mcp) or `ttd_get_report` (ttd-mcp) to understand current delivery before making adjustments.
- **Applies to**: dbm-mcp, dv360-mcp, ttd-mcp, `mcp.troubleshoot.delivery`

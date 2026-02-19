# TTD Reporting Tips

Learnings about the TTD MyReports V3 API for report generation and download.

## Two-step report workflow
- **Date**: 2026-02-19
- **Source**: Implementation experience
- **Context**: TTD reports are asynchronous. `ttd_get_report` creates a report schedule, polls for completion, and returns a download URL. `ttd_download_report` then fetches and parses the CSV.
- **Recommendation**: Always use the two-step flow: `ttd_get_report` first, then `ttd_download_report` with the returned URL.
- **Applies to**: ttd-mcp, `ttd_get_report`, `ttd_download_report`, `mcp.execute.ttd_report`

## Fewer dimensions = faster reports
- **Date**: 2026-02-19
- **Source**: Performance observations
- **Context**: Reports with many dimensions generate more rows and take longer to execute. Reports with >12 dimensions may time out during the 5-minute polling window.
- **Recommendation**: Start with essential dimensions only. Add more if needed. Use shorter date ranges for dimension-heavy reports.
- **Applies to**: ttd-mcp, `ttd_get_report`

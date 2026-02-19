# Campaign Setup Learnings

Cross-platform insights for setting up campaigns.

## Always verify parent entities before creating children
- **Date**: 2026-02-19
- **Source**: Workflow design
- **Context**: Across all platforms (DV360, TTD, Google Ads), child entities require valid parent IDs. Creating children before parents exist results in API errors that don't always clearly indicate the missing parent.
- **Recommendation**: Use get/list tools to verify parent entities exist before creating children. Follow platform-specific hierarchy: DV360 (Campaign > IO > Line Item), TTD (Campaign > Ad Group > Ad), Google Ads (Campaign > Ad Group > Ad/Keyword).
- **Applies to**: all servers, campaign creation workflows

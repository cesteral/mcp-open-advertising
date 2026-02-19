# Learnings Tree

A curated, shared knowledge base of insights discovered through usage of Cesteral MCP servers. Both humans and AI agents contribute to and read from these files.

## Structure

```
learnings/
  platforms/       Platform-specific API gotchas and patterns
    ttd/           The Trade Desk
    dv360/         Display & Video 360
    gads/          Google Ads
    dbm/           Bid Manager (DV360 reporting)
  workflows/       Cross-platform workflow learnings
  agent-behaviors/ Patterns in how AI agents use the tools
  meta/            Curation and maintenance logs
```

## How to Contribute

### Via MCP Tool (Recommended)
Use the `submit_learning` tool from any Cesteral MCP server:

```json
{
  "category": "platform",
  "platform": "ttd",
  "title": "Ad Group requires CampaignId in data payload",
  "content": "ttd_create_entity with entityType=adGroup fails if CampaignId is missing from the data payload. Always include it inside the `data` object."
}
```

### Via Git
1. Find the appropriate file under `learnings/`
2. Add a new entry at the **top** of the file (newest first)
3. Use the standard entry format below
4. Submit a PR for review

## Entry Format

```markdown
## Short descriptive title
- **Date**: YYYY-MM-DD
- **Source**: User session / interaction log / code review
- **Context**: What was happening when this was discovered
- **Recommendation**: What to do about it
- **Applies to**: server name, workflow ID, tool name
```

## Maintenance

Learnings should be periodically reviewed for staleness. The `learnings-reviewer` agent skill can help identify outdated entries. See `meta/curation-log.md` for review history.

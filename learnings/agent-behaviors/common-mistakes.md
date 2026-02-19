# Common Agent Mistakes

Patterns of mistakes that AI agents repeatedly make when using Cesteral MCP tools.

## Skipping schema lookup before entity updates
- **Date**: 2026-02-19
- **Source**: Evaluator pattern analysis
- **Context**: Agents frequently attempt entity updates without first reading the entity schema resource. This leads to incorrect field names, missing required fields, or overly broad update masks.
- **Recommendation**: Always read `entity-schema://{entityType}` before creating or updating entities. The schema contains field names, types, and required/optional annotations.
- **Applies to**: dv360-mcp, ttd-mcp, gads-mcp, `SchemaLookupOmission` evaluator class

## Sending too many fields in update payloads
- **Date**: 2026-02-19
- **Source**: Evaluator findings
- **Context**: Agents sometimes copy an entire entity's fields into an update payload rather than specifying only the changed fields. This triggers evaluator warnings and can cause unintended side effects.
- **Recommendation**: Only include fields that are actually changing. Use `entity-fields://{entityType}` to understand the valid field paths for updateMask.
- **Applies to**: dv360-mcp, ttd-mcp, gads-mcp, `InputQuality` evaluator class

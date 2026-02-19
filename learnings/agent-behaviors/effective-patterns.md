# Effective Agent Patterns

Patterns that work well when AI agents use Cesteral MCP tools.

## Schema-first approach
- **Date**: 2026-02-19
- **Source**: Workflow design
- **Context**: Agents that read entity schemas and examples before attempting CRUD operations have significantly higher success rates. The schema provides field names, types, and constraints that prevent validation errors.
- **Recommendation**: Follow the sequence: read schema -> read examples -> build payload -> execute tool -> verify result.
- **Applies to**: all servers, all entity CRUD workflows

## Verify after mutate
- **Date**: 2026-02-19
- **Source**: Workflow design
- **Context**: After creating or updating an entity, a follow-up GET call confirms the changes were applied correctly. This catches silent failures and partial updates.
- **Recommendation**: Always call the corresponding get tool after create/update operations to verify the result matches expectations.
- **Applies to**: all servers, all entity CRUD workflows

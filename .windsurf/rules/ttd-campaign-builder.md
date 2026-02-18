<!-- GENERATED FILE — DO NOT EDIT DIRECTLY -->
<!-- Source: skills/canonical/ttd-campaign-builder/SKILL.md -->
<!-- Regenerate: pnpm generate:skills -->


# TTD Campaign Builder

Workflow ID: `mcp.execute.ttd_campaign_setup`

## Use When

- You need to create a new TTD campaign structure (Campaign → Ad Group → Ad → Creative).
- You need schema-guided entity creation with validation.
- You need explicit payload diff and verification output.

## Steps

1. Invoke prompt:
   - `ttd_campaign_setup_workflow`
2. Read required resources:
   - `entity-schema://{entityType}` (for each entity in the hierarchy)
   - `entity-examples://{entityType}`
3. Build entity payloads following the hierarchy order.
4. Execute `ttd_create_entity` for each entity in sequence.
5. Verify each created entity with `ttd_get_entity`.

## Required Output Sections

- `ChangePlan`
- `PayloadDiff`
- `VerificationResult`

## Constraints

- Create entities in hierarchy order (Campaign before Ad Group before Ad).
- Use `ttd_validate_entity` for dry-run validation before writes when available.
- Always include a verification step after each creation.

<!-- GENERATED FILE — DO NOT EDIT DIRECTLY -->
<!-- Source: skills/canonical/dv360-entity-updater/SKILL.md -->
<!-- Regenerate: pnpm generate:skills -->


# DV360 Entity Updater

Workflow ID: `mcp.execute.dv360_entity_update`

## Use When

- You need to apply a DV360 update safely.
- You need a deterministic prompt/resource/tool call sequence.
- You need auditable, minimal-change execution.

## Steps

1. Invoke prompt:
   - `entity_update_execution_workflow`
2. Read required resources:
   - `entity-schema://{entityType}`
   - `entity-fields://{entityType}`
   - `entity-examples://{entityType}` (optional)
3. Build minimal payload and exact `updateMask`.
4. Execute `dv360_update_entity`.
5. Verify with `dv360_get_entity`.

## Required Output Sections

- `ChangePlan`
- `UpdateMask`
- `VerificationResult`

## Constraints

- One small update per execution step.
- No broad `updateMask` values.
- No unrelated fields in `data`.

<!-- GENERATED FILE — DO NOT EDIT DIRECTLY -->
<!-- Source: skills/canonical/ttd-entity-updater/SKILL.md -->
<!-- Regenerate: pnpm generate:skills -->


# TTD Entity Updater

Workflow ID: `mcp.execute.ttd_entity_update`

## Use When

- You need to create/update/delete TTD entities safely.
- You need schema-guided entity updates with prompt-driven flow.
- You need explicit payload diff and verification output.

## Steps

1. Invoke the `ttd_campaign_setup_workflow` prompt for schema-guided workflow sequencing.
2. Discover available TTD tools with `tools/list`.
3. Retrieve baseline entity state with `ttd_get_entity` (or `ttd_list_entities`).
4. Build minimal payload change for `ttd_create_entity` or `ttd_update_entity`.
5. Execute the write operation.
6. Verify with `ttd_get_entity` and summarize the delta.

## Required Output Sections

- `ChangePlan`
- `PayloadDiff`
- `VerificationResult`

## Constraints

- Prefer one scoped change per call.
- Avoid broad payload rewrites.
- Always include a verification step after writes.

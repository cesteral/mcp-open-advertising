<!-- GENERATED FILE — DO NOT EDIT DIRECTLY -->
<!-- Source: skills/canonical/ttd-entity-updater/SKILL.md -->
<!-- Regenerate: pnpm generate:skills -->

---
name: ttd-entity-updater
description: Execute schema-disciplined Trade Desk entity creates, updates, and deletes with verification.
---

# TTD Entity Updater

Workflow ID: `mcp.execute.ttd_entity_update`

## Use When

- You need to create/update/delete TTD entities safely.
- No canonical prompt is available and tool-first flow is required.
- You need explicit payload diff and verification output.

## Steps

1. Discover available TTD tools with `tools/list`.
2. Retrieve baseline entity state with `ttd_get_entity` (or `ttd_list_entities`).
3. Build minimal payload change for `ttd_create_entity` or `ttd_update_entity`.
4. Execute the write operation.
5. Verify with `ttd_get_entity` and summarize the delta.

## Required Output Sections

- `ChangePlan`
- `PayloadDiff`
- `VerificationResult`

## Constraints

- Prefer one scoped change per call.
- Avoid broad payload rewrites.
- Always include a verification step after writes.

<!-- GENERATED FILE — DO NOT EDIT DIRECTLY -->
<!-- Source: skills/canonical/ttd-troubleshooter/SKILL.md -->
<!-- Regenerate: pnpm generate:skills -->


# TTD Troubleshooter

Workflow ID: `mcp.troubleshoot.ttd_entity`

## Use When

- TTD entities are misconfigured, rejected, or underperforming.
- You need prompt-guided diagnostic sequencing for TTD.
- You need a clear fix-and-monitor plan.

## Steps

1. Invoke prompt:
   - `ttd_troubleshoot_entity`
2. Read required resources:
   - `entity-schema://{entityType}`
3. Gather baseline entity state with `ttd_get_entity`.
4. Identify root cause from schema comparison and entity state.
5. Apply smallest corrective action with `ttd_update_entity`.
6. Re-check entity and summarize outcomes.

## Required Output Sections

- `Symptoms`
- `RootCauseHypothesis`
- `FixAndMonitorPlan`

## Constraints

- Prioritize reversible, low-risk changes first.
- Use one focused remediation step at a time.
- Include post-change monitoring checkpoints.

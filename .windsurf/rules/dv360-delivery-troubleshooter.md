<!-- GENERATED FILE — DO NOT EDIT DIRECTLY -->
<!-- Source: skills/canonical/dv360-delivery-troubleshooter/SKILL.md -->
<!-- Regenerate: pnpm generate:skills -->


# DV360 Delivery Troubleshooter

Workflow ID: `mcp.troubleshoot.delivery`

## Use When

- Campaigns or line items are underdelivering.
- You need prompt-guided diagnostic sequencing.
- You need a clear fix-and-monitor plan.

## Steps

1. Pick primary prompt based on context:
   - Reporting side: `troubleshoot_report`
   - Management side: `troubleshoot_underdelivery`
2. Read targeted resources:
   - `compatibility-rules://all`
   - `targeting-types://`
   - `entity-fields://{entityType}`
3. Gather baseline using reporting tools (`get_pacing_status`, `get_performance_metrics`).
4. Apply smallest corrective action with management tools (`dv360_update_entity`, `dv360_adjust_line_item_bids`, `dv360_bulk_update_status`).
5. Re-check delivery and summarize outcomes.

## Required Output Sections

- `Symptoms`
- `RootCauseHypothesis`
- `FixAndMonitorPlan`

## Constraints

- Prioritize reversible, low-risk changes first.
- Use one focused remediation step at a time.
- Include post-change monitoring checkpoints.

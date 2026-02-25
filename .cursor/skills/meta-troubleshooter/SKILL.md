<!-- GENERATED FILE — DO NOT EDIT DIRECTLY -->
<!-- Source: skills/canonical/meta-troubleshooter/SKILL.md -->
<!-- Regenerate: pnpm generate:skills -->

---
name: meta-troubleshooter
description: Diagnose and remediate Meta Ads entity issues using API inspection and targeted fixes.
---

# Meta Ads Troubleshooter

Workflow ID: `mcp.troubleshoot.meta_entity`

## Use When

- Meta Ads entities are misconfigured, rejected, or underperforming.
- You need prompt-guided diagnostic sequencing for Meta Ads.
- You need a clear fix-and-monitor plan.

## Steps

1. Invoke prompt:
   - `meta_troubleshoot_entity` with `entityType` and `entityId`
2. Read required resources:
   - `entity-hierarchy://all`
   - `entity-schema://{entityType}`
   - `entity-examples://{entityType}`
3. Check parent entity status first (Campaign → Ad Set → Ad).
4. Gather baseline entity state with `meta_get_entity`.
5. Identify root cause from schema comparison and entity state.
6. Apply smallest corrective action with `meta_update_entity`.
7. Re-check entity and summarize outcomes.

## Required Output Sections

- `Symptoms`
- `RootCauseHypothesis`
- `FixAndMonitorPlan`

## Constraints

- Always check parent entity status before investigating children.
- Insights data may lag up to 48 hours; factor this into delivery analysis.
- ARCHIVED status is permanent and cannot be reversed.
- Prioritize reversible, low-risk changes first.
- Use one focused remediation step at a time.

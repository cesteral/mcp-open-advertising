# Playbook Delta Template

Use this template when converting evaluator findings into a proposed skill/playbook update.

## Metadata

- `findingId`:
- `createdAt`:
- `owner`:
- `riskClass`: `low` | `medium` | `high`
- `platform`:
- `serverPackage`:
- `workflowId`:

## Evidence

- `occurrenceCount`:
- `timeWindow`:
- `confidence`:
- `sampleEventIds`:

## Proposed Changes

List exact edits by file path and purpose.

- `docs/...`:
- `.cursor/skills/...`:
- `.codex/skills/...`:
- `docs/mcp-skill-contract.json` (if needed):
- `docs/client-workflow-mappings.md` (if needed):

## Safety and Rollout

- `observeOnlyFirst`: true/false
- `featureFlagName`:
- `rollbackTrigger`:
- `successMetric`:

## Reviewer Checklist

- [ ] Required output sections remain valid for impacted workflow(s)
- [ ] Contract versioning policy is followed
- [ ] Validator coverage is updated (if needed)
- [ ] Rollback path is documented and tested

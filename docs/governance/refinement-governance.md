# Refinement Governance

This document defines how LLM -> MCP interaction findings are converted into controlled skill/playbook improvements.

## Lifecycle

1. Capture interaction event.
2. Classify issue or inefficiency.
3. Generate a proposed playbook delta.
4. Review and approve based on risk.
5. Deploy with observe-first rollout.
6. Measure impact and keep or roll back.

## Finding Taxonomy

- `input_quality`: missing/invalid parameters, schema drift, poor defaults.
- `workflow_sequencing`: missing prerequisite resource/prompt/tool step.
- `efficiency`: unnecessary calls, repeated fetches, over-broad resources.
- `platform_integration`: auth/rate-limit/platform-specific contract mismatch.

## Proposal Artifact

Each proposal must include:

- `findingId`: stable identifier.
- `workflowId`: canonical workflow impacted.
- `platform`: `dv360` | `dbm` | `ttd` | future platform ID.
- `evidence`: count, sample events, and confidence.
- `proposedChanges`: exact docs/adapter/contract edits.
- `riskClass`: low, medium, high.
- `rollbackTrigger`: metric threshold for reverting.

Use these artifacts:

- Template: `docs/governance/playbook-delta-template.md`
- JSON schema: `docs/governance/playbook-delta.schema.json`

## Approval Matrix

- Low risk: one maintainer.
- Medium risk: one maintainer + one package owner.
- High risk: shared contract owner + package owner.

## Observe-First Rollout

- Start in observe-only mode for at least one release cycle.
- Promote rule enforcement only after threshold confidence.
- Keep per-workflow and per-platform kill switch.

## Rollback

Rollback is mandatory if one or more conditions occur:

- Avoidable failure rate increases after rollout.
- Median call depth increases for target workflow.
- Repeated false positive classifications exceed threshold.

## Required Metrics

- `avoidable_failure_rate`
- `workflow_retry_rate`
- `median_tool_call_depth`
- `redundant_resource_fetch_rate`

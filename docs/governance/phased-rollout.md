# Evaluator Phased Rollout

> **Implementation Status**: Stage 1 active (observe-only). Stages 2-3 depend on finding aggregation and pattern detection from Phases 2-3 of `docs/architecture/self-improving-skills.md`.

This rollout plan applies to `dv360-mcp`, `dbm-mcp`, `ttd-mcp`, `gads-mcp`, and `meta-mcp`.

## Feature Flags

- `MCP_EVALUATOR_ENABLED` (default: `true`)
- `MCP_EVALUATOR_OBSERVE_ONLY` (default: `true`)

## Rollout Stages

1. Observe-only everywhere (`enabled=true`, `observe_only=true`)
2. Enforce selectively on low-risk workflows in one package at a time
3. Expand enforcement by workflow after stability checks
4. Keep global kill switch and package-level rollback path

## Package Order

1. `dv360-mcp`
2. `dbm-mcp`
3. `ttd-mcp`
4. `gads-mcp`
5. `meta-mcp`
6. Future packages using `docs/packages/package-template.md`

## Entry Criteria (per package)

- Required telemetry attributes emitted on all tool executions
- Evaluator findings are visible in dashboards
- No sustained increase in avoidable failures for one release cycle

## Exit Criteria (per package)

- Stable avoidable failure rate
- Stable or improved workflow call depth
- No critical false-positive patterns

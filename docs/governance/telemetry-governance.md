# Telemetry Governance

> [!NOTE]
> **Implementation Status:** Partially implemented. Tool execution spans and core metrics are emitted. Evaluator attributes (`mcp.evaluator.*`) and refinement metrics (`mcp.pattern.count`, `mcp.refinement.proposal.count`) are planned for a future phase.

This document defines the shared telemetry contract for MCP interaction refinement across all platform packages.

---

## What's Live Today

### Required Span Naming

- Tool execution span: `tool.{toolName}`

### Required Tool Span Attributes ✅

- `mcp.platform`
- `mcp.server.package`
- `mcp.workflow.id`
- `mcp.tool.name`
- `mcp.tool.execution.success`
- `mcp.tool.execution.latency_ms`
- `mcp.tool.retry_count`
- `mcp.tool.error_class` (if failed)

### Live Metric Conventions ✅

- Counter: `mcp.tool.execution.count`
- Histogram: `mcp.tool.execution.duration_ms`
- Histogram: `mcp.workflow.call_depth`

### Minimal Cross-Package Event Schema

- `platform`
- `serverPackage`
- `workflowId`
- `toolName`
- `latencyMs`
- `retryCount`
- `errorClass`
- `wasRecoverable`
- `resourceFetchCount`
- `redundantCallSignals`

---

## Planned (Future Phase)

> [!WARNING]
> The evaluator and refinement spans below are planned, not yet implemented. Do not reference these attributes in production dashboards.

### Evaluator Span Naming

- Evaluator span: `tool.{toolName}.evaluation`
- Refinement decision span: `workflow.{workflowId}.refinement_decision`

### Required Evaluator Attributes

- `mcp.evaluator.observe_only`
- `mcp.evaluator.input_quality_score`
- `mcp.evaluator.efficiency_score`
- `mcp.evaluator.issues.count`
- `mcp.evaluator.recommendation.action`

### Evaluator + Refinement Metrics

- Counter: `mcp.evaluator.finding.count`
- Counter: `mcp.evaluator.recommendation.count`

---

## Adoption Requirements

Each package must:

1. Emit required span attributes for every tool call.
2. Emit evaluator findings in observe-only mode first.
3. Expose dashboards for avoidable failures and call depth.
4. Document package-specific telemetry extensions in package docs.

All metric labels must use snake_case.

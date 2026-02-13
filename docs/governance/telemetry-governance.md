# Telemetry Governance

This document defines the shared telemetry contract for MCP interaction refinement across all platform packages.

## Required Span Naming

- Tool execution span: `tool.{toolName}`
- Evaluator span: `tool.{toolName}.evaluation`
- Refinement decision span: `workflow.{workflowId}.refinement_decision`

## Required Tool Span Attributes

- `mcp.platform`
- `mcp.server.package`
- `mcp.workflow.id`
- `mcp.tool.name`
- `mcp.tool.execution.success`
- `mcp.tool.execution.latency_ms`
- `mcp.tool.retry_count`
- `mcp.tool.error_class` (if failed)

## Required Evaluator Attributes

- `mcp.evaluator.observe_only`
- `mcp.evaluator.input_quality_score`
- `mcp.evaluator.efficiency_score`
- `mcp.evaluator.issues.count`
- `mcp.evaluator.recommendation.action`

## Metric Conventions

- Counter: `mcp.tool.execution.count`
- Histogram: `mcp.tool.execution.duration_ms`
- Counter: `mcp.evaluator.finding.count`
- Counter: `mcp.evaluator.recommendation.count`
- Histogram: `mcp.workflow.call_depth`

All metric labels must use snake_case.

## Minimal Cross-Package Event Schema

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

## Adoption Requirements

Each package must:

1. Emit required span attributes for every tool call.
2. Emit evaluator findings in observe-only mode first.
3. Expose dashboards for avoidable failures and call depth.
4. Document package-specific telemetry extensions in package docs.

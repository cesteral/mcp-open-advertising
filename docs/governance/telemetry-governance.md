# Telemetry Governance

This document defines the shared telemetry contract for MCP tool execution across all platform packages.

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

## Adoption Requirements

Each package must:

1. Emit required span attributes for every tool call.
2. Expose dashboards for avoidable failures and call depth.
3. Document package-specific telemetry extensions in package docs.

All metric labels must use snake_case.

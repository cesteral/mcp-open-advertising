# OTEL → GCP Observability Design

**Date:** 2026-02-26
**Status:** Approved
**Scope:** Wire existing OpenTelemetry instrumentation to GCP Cloud Trace + Cloud Monitoring; add dashboard, notification channels, and audit-denial alerting.

---

## Problem

The codebase has complete OpenTelemetry instrumentation (`withToolSpan()`, `recordToolExecution()`, `registerActiveSessionsGauge()`, `recordAuthValidation()`, etc.) and a Terraform monitoring module with four alert policies per service. Neither is connected to anything:

- Alert policies reference `var.notification_channels` which defaults to `[]` — alerts go nowhere.
- `initializeOpenTelemetry()` uses `OTLPTraceExporter` / `OTLPMetricExporter` which require an explicit endpoint — no endpoint is configured in production, so traces and custom metrics are silently dropped.
- No Cloud Monitoring dashboard exists.

---

## Architecture

```
MCP Servers (Cloud Run)
  │
  ├─ Traces: withToolSpan() → TraceExporter → Cloud Trace
  │    (tool name, advertiserId, entityType, duration, errors)
  │
  ├─ Metrics: recordToolExecution() / registerActiveSessionsGauge() / etc.
  │    → MetricExporter → Cloud Monitoring (custom metrics)
  │
  └─ Logs: Pino JSON → stdout → Cloud Logging (already working)
              └─ log-based metric filter → Cloud Monitoring alert
```

**No changes to any MCP server packages.** All 5 server packages remain untouched. Only `packages/shared` (telemetry wiring) and `terraform/` (infra resources) change.

---

## Application Code Changes (`packages/shared`)

### New dependencies

```
@google-cloud/opentelemetry-cloud-trace-exporter
@google-cloud/opentelemetry-cloud-monitoring-exporter
```

### Exporter selection logic in `initializeOpenTelemetry()`

```
if (K_SERVICE env var is set — running on Cloud Run)
  → use TraceExporter + MetricExporter from @google-cloud/opentelemetry-*
  → authenticates automatically via workload identity (no credentials needed)
else if OTEL_EXPORTER_OTLP_TRACES_ENDPOINT / OTEL_EXPORTER_OTLP_METRICS_ENDPOINT set
  → use existing OTLPTraceExporter + OTLPMetricExporter (local dev / custom collector)
else
  → traces and metrics disabled (no-op)
```

### `OtelConfig` interface

Add one optional field:

```typescript
export interface OtelConfig {
  otelEnabled: boolean;
  otelServiceName: string;
  otelExporterOtlpTracesEndpoint?: string;
  otelExporterOtlpMetricsEndpoint?: string;
  otelSamplingRatio?: number;
  // New: force GCP exporters regardless of K_SERVICE detection
  gcpExporter?: boolean;
}
```

`gcpExporter` is auto-detected from `K_SERVICE` if not explicitly set. No server packages need to pass it.

### Files changed

| File | Change |
|------|--------|
| `packages/shared/package.json` | Add 2 GCP OTEL exporter packages |
| `packages/shared/src/utils/telemetry.ts` | Conditional exporter selection |

---

## Terraform Changes

### Notification channels (`terraform/modules/monitoring/main.tf`)

New resource:

```hcl
resource "google_monitoring_notification_channel" "email" {
  display_name = "Cesteral Alerts - ${var.environment}"
  type         = "email"
  labels       = { email_address = var.notification_email }
  project      = var.project_id
}
```

The existing 4 alert policies (error rate, P99 latency, instance count, uptime failure) already reference `var.notification_channels`. Wire this channel's ID in automatically by appending it to the list passed from `main.tf`.

New variable:

```hcl
variable "notification_email" {
  type        = string
  description = "Email address for alert notifications"
  default     = ""
}
```

### Cloud Monitoring Dashboard (`terraform/modules/monitoring/main.tf`)

One `google_monitoring_dashboard` resource. Dashboard rows:

| Row | Charts | Metric source |
|-----|--------|---------------|
| Service Health | Uptime check status — 5 services | `monitoring.googleapis.com/uptime_check/check_passed` |
| Request Traffic | Request count per service | `run.googleapis.com/request_count` |
| Latency | P50 + P99 per service | `run.googleapis.com/request_latencies` |
| Tool Execution | Call count by `tool_name` + `status` | `custom.googleapis.com/opencensus/mcp/tool/execution/count` |
| Tool Duration | P99 duration by `tool_name` | `custom.googleapis.com/opencensus/mcp/tool/execution/duration_ms` |
| Sessions + Auth | Active sessions gauge + auth validation count | `mcp.session.active`, `mcp.auth.validation.count` |

Dashboard JSON is inlined as a Terraform `jsonencode()` block.

### Log-based metric + alert (`terraform/modules/monitoring/main.tf`)

Log-based metric filtering for audit denial events:

```
resource.type="cloud_run_revision"
jsonPayload.component="audit"
jsonPayload.event="tool_access_denied"
```

Alert condition: if `tool_access_denied` count > 10 in a 5-minute window → notify.

### IAM additions (`terraform/modules/mcp-service/`)

The Cloud Run service account needs two new roles for the GCP OTEL exporters:

```hcl
roles/cloudtrace.agent        # Write traces to Cloud Trace
roles/monitoring.metricWriter  # Write custom metrics to Cloud Monitoring
```

These are added to the existing IAM bindings in the `mcp-service` module.

### `.tfvars` additions

Add to `dev.tfvars` and `prod.tfvars`:

```hcl
monitoring_notification_email = "daniel@cesteral.com"

monitoring_services = [
  { name = "dbm-mcp",   url = "https://dbm-mcp-HASH-ew.a.run.app" },
  { name = "dv360-mcp", url = "https://dv360-mcp-HASH-ew.a.run.app" },
  { name = "ttd-mcp",   url = "https://ttd-mcp-HASH-ew.a.run.app" },
  { name = "gads-mcp",  url = "https://gads-mcp-HASH-ew.a.run.app" },
  { name = "meta-mcp",  url = "https://meta-mcp-HASH-ew.a.run.app" },
]
```

Cloud Run URLs are placeholder — fill in after `terraform apply` for the first time.

---

## Files Changed Summary

| File | Change |
|------|--------|
| `packages/shared/package.json` | Add `@google-cloud/opentelemetry-cloud-trace-exporter`, `@google-cloud/opentelemetry-cloud-monitoring-exporter` |
| `packages/shared/src/utils/telemetry.ts` | Conditional GCP vs OTLP exporter selection |
| `terraform/modules/monitoring/main.tf` | Add notification channel, dashboard, log-based metric + alert |
| `terraform/modules/monitoring/variables.tf` | Add `notification_email` variable |
| `terraform/modules/mcp-service/main.tf` | Add `roles/cloudtrace.agent` + `roles/monitoring.metricWriter` IAM bindings |
| `terraform/variables.tf` | Add `monitoring_notification_email` variable |
| `terraform/dev.tfvars` | Add email + services list |
| `terraform/prod.tfvars` | Add email + services list |

---

## Backwards Compatibility

- Local dev: OTEL remains disabled unless `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` is set. No behaviour change.
- Existing JWT tokens, session management, tool handlers: unchanged.
- Terraform: `monitoring_notification_email = ""` default means existing deployments without the new variable don't break.

---

## Success Criteria

- Traces appear in GCP Cloud Trace within 60 seconds of a tool call on Cloud Run.
- Custom metrics (`mcp.tool.execution.count`, `mcp.session.active`) appear in Cloud Monitoring.
- Cloud Monitoring dashboard loads and shows data for all 5 services.
- Alert email fires when a synthetic error-rate test is triggered.
- Audit-denial alert fires when `tool_access_denied` threshold is crossed.
- All existing tests continue to pass (`pnpm run test`).

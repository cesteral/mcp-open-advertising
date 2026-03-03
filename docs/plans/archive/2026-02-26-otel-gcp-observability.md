# OTEL → GCP Observability Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire the existing OpenTelemetry instrumentation to GCP Cloud Trace + Cloud Monitoring, and add a dashboard, email notification channel, and audit-denial alert to Terraform.

**Architecture:** When running on Cloud Run (`K_SERVICE` env var is set), swap the OTLP HTTP exporters for GCP-native exporters (`@google-cloud/opentelemetry-cloud-trace-exporter` + `@google-cloud/opentelemetry-cloud-monitoring-exporter`) that authenticate via workload identity. All OTel metrics already being emitted (`mcp.tool.execution.count`, `mcp.session.active`, etc.) will flow into Cloud Monitoring automatically. A Terraform monitoring module update adds an email notification channel (wired to existing alert policies), a Cloud Monitoring dashboard, and a log-based metric alert for audit access-denial events.

**Tech Stack:** TypeScript, vitest, `@google-cloud/opentelemetry-cloud-trace-exporter`, `@google-cloud/opentelemetry-cloud-monitoring-exporter`, Terraform (GCP), Pino JSON logging.

**IAM note:** `roles/cloudtrace.agent` and `roles/monitoring.metricWriter` are **already** in `terraform/modules/mcp-service/main.tf`. No IAM changes needed.

---

### Task 1: Add GCP OTEL exporter npm packages

**Files:**
- Modify: `packages/shared/package.json`

**Step 1: Add two new dependencies**

In `packages/shared/package.json`, add to the `"dependencies"` block (after the existing `@opentelemetry/*` entries):

```json
"@google-cloud/opentelemetry-cloud-trace-exporter": "^2.0.0",
"@google-cloud/opentelemetry-cloud-monitoring-exporter": "^0.20.0",
```

**Step 2: Install and verify the build**

Run from the repo root:
```bash
pnpm install
pnpm run build
```
Expected: Build succeeds with no type errors.

**Step 3: Commit**

```bash
git add packages/shared/package.json pnpm-lock.yaml
git commit -m "chore(shared): add GCP OTEL trace and monitoring exporter packages"
```

---

### Task 2: Extract `buildExporters()` and add tests (TDD)

**Files:**
- Modify: `packages/shared/src/utils/telemetry.ts`
- Modify: `packages/shared/tests/utils/telemetry.test.ts`

**Step 1: Write three failing tests**

In `packages/shared/tests/utils/telemetry.test.ts`, add the following mocks at the top of the file alongside the existing `vi.mock(...)` calls (before any imports from `../../src`):

```typescript
vi.mock("@google-cloud/opentelemetry-cloud-trace-exporter", () => ({
  TraceExporter: vi.fn().mockImplementation(() => ({ type: "gcp-trace" })),
}));
vi.mock("@google-cloud/opentelemetry-cloud-monitoring-exporter", () => ({
  MetricExporter: vi.fn().mockImplementation(() => ({ type: "gcp-metrics" })),
}));
```

Then add this import at the top of the test file (alongside the existing named imports):

```typescript
import { TraceExporter as GcpTraceExporter } from "@google-cloud/opentelemetry-cloud-trace-exporter";
import { MetricExporter as GcpMetricExporter } from "@google-cloud/opentelemetry-cloud-monitoring-exporter";
```

Then add a new `describe` block at the bottom of the file, inside the outer `describe("telemetry utilities", ...)`:

```typescript
describe("buildExporters", () => {
  const originalKService = process.env.K_SERVICE;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.K_SERVICE;
  });

  afterEach(() => {
    if (originalKService !== undefined) {
      process.env.K_SERVICE = originalKService;
    } else {
      delete process.env.K_SERVICE;
    }
  });

  it("selects GCP exporters when K_SERVICE env var is set", async () => {
    process.env.K_SERVICE = "dbm-mcp";

    const { buildExporters } = await import("../../src/utils/telemetry.js");
    const { traceExporter, metricReader } = buildExporters({
      otelEnabled: true,
      otelServiceName: "test",
    });

    expect(GcpTraceExporter).toHaveBeenCalledOnce();
    expect(GcpMetricExporter).toHaveBeenCalledOnce();
    expect(traceExporter).toBeDefined();
    expect(metricReader).toBeDefined();
  });

  it("selects GCP exporters when gcpExporter: true is passed explicitly", async () => {
    // K_SERVICE not set — config override
    const { buildExporters } = await import("../../src/utils/telemetry.js");
    const { traceExporter, metricReader } = buildExporters({
      otelEnabled: true,
      otelServiceName: "test",
      gcpExporter: true,
    });

    expect(GcpTraceExporter).toHaveBeenCalledOnce();
    expect(GcpMetricExporter).toHaveBeenCalledOnce();
    expect(traceExporter).toBeDefined();
    expect(metricReader).toBeDefined();
  });

  it("selects OTLP exporters when endpoints are configured and not on Cloud Run", async () => {
    const { buildExporters } = await import("../../src/utils/telemetry.js");
    const { traceExporter, metricReader } = buildExporters({
      otelEnabled: true,
      otelServiceName: "test",
      otelExporterOtlpTracesEndpoint: "http://localhost:4318/v1/traces",
      otelExporterOtlpMetricsEndpoint: "http://localhost:4318/v1/metrics",
    });

    const { OTLPTraceExporter } = await import("@opentelemetry/exporter-trace-otlp-http");
    const { OTLPMetricExporter } = await import("@opentelemetry/exporter-metrics-otlp-http");

    expect(OTLPTraceExporter).toHaveBeenCalledOnce();
    expect(OTLPMetricExporter).toHaveBeenCalledOnce();
    expect(traceExporter).toBeDefined();
    expect(metricReader).toBeDefined();
  });

  it("returns undefined exporters when no Cloud Run and no OTLP endpoints", async () => {
    const { buildExporters } = await import("../../src/utils/telemetry.js");
    const { traceExporter, metricReader } = buildExporters({
      otelEnabled: true,
      otelServiceName: "test",
    });

    expect(traceExporter).toBeUndefined();
    expect(metricReader).toBeUndefined();
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
cd packages/shared && pnpm run test -- --run tests/utils/telemetry.test.ts
```
Expected: FAIL — `buildExporters` is not exported from telemetry.ts.

**Step 3: Implement `buildExporters()` in telemetry.ts**

At the top of `packages/shared/src/utils/telemetry.ts`, add the GCP exporter imports alongside the existing OTLP imports:

```typescript
import { TraceExporter as GcpTraceExporter } from "@google-cloud/opentelemetry-cloud-trace-exporter";
import { MetricExporter as GcpMetricExporter } from "@google-cloud/opentelemetry-cloud-monitoring-exporter";
```

Add `gcpExporter?: boolean` to the `OtelConfig` interface:

```typescript
export interface OtelConfig {
  otelEnabled: boolean;
  otelServiceName: string;
  otelExporterOtlpTracesEndpoint?: string;
  otelExporterOtlpMetricsEndpoint?: string;
  otelSamplingRatio?: number;
  gcpExporter?: boolean;  // ← new field
}
```

Add the new exported `buildExporters()` function immediately before `initializeOpenTelemetry()`:

```typescript
/**
 * Select trace exporter and metric reader based on environment.
 * - Cloud Run (K_SERVICE set) or gcpExporter:true → GCP-native exporters (workload identity auth)
 * - OTLP endpoint env vars set → OTLP HTTP exporters (local dev / custom collector)
 * - Neither → no-op (undefined)
 */
export function buildExporters(config: OtelConfig): {
  traceExporter: GcpTraceExporter | OTLPTraceExporter | undefined;
  metricReader: PeriodicExportingMetricReader | undefined;
} {
  const useGcp = config.gcpExporter ?? !!process.env.K_SERVICE;

  if (useGcp) {
    return {
      traceExporter: new GcpTraceExporter(),
      metricReader: new PeriodicExportingMetricReader({
        exporter: new GcpMetricExporter(),
        exportIntervalMillis: 60_000,
      }),
    };
  }

  const traceExporter = config.otelExporterOtlpTracesEndpoint
    ? new OTLPTraceExporter({ url: config.otelExporterOtlpTracesEndpoint })
    : undefined;

  const metricReader = config.otelExporterOtlpMetricsEndpoint
    ? new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({
          url: config.otelExporterOtlpMetricsEndpoint,
        }),
        exportIntervalMillis: 60_000,
      })
    : undefined;

  return { traceExporter, metricReader };
}
```

Then update `initializeOpenTelemetry()` to call `buildExporters()` instead of building exporters inline. Replace the two existing exporter construction blocks (the `const traceExporter = ...` and `const metricReader = ...` lines) with:

```typescript
const { traceExporter, metricReader } = buildExporters(config);
```

**Step 4: Run tests to verify they pass**

```bash
cd packages/shared && pnpm run test -- --run tests/utils/telemetry.test.ts
```
Expected: All tests pass including the 4 new `buildExporters` tests.

**Step 5: Run full test suite**

```bash
cd /path/to/repo && pnpm run test
```
Expected: All 7 packages pass (652+ tests).

**Step 6: Commit**

```bash
git add packages/shared/src/utils/telemetry.ts packages/shared/tests/utils/telemetry.test.ts
git commit -m "feat(shared): wire GCP OTEL exporters when running on Cloud Run

Auto-detects Cloud Run via K_SERVICE env var and uses
@google-cloud/opentelemetry-cloud-trace-exporter +
@google-cloud/opentelemetry-cloud-monitoring-exporter.
Falls back to OTLP HTTP exporters for local dev.
Extracts buildExporters() helper for testability."
```

---

### Task 3: Add email notification channel to monitoring Terraform module

**Files:**
- Modify: `terraform/modules/monitoring/main.tf`
- Modify: `terraform/modules/monitoring/variables.tf`
- Modify: `terraform/variables.tf`
- Modify: `terraform/main.tf`

**Step 1: Add `notification_email` variable to the monitoring module**

In `terraform/modules/monitoring/variables.tf`, append:

```hcl
variable "notification_email" {
  type        = string
  description = "Email address for alert notification channel. Empty string disables email channel."
  default     = ""
}
```

**Step 2: Create the email notification channel in the monitoring module**

In `terraform/modules/monitoring/main.tf`, add this block before the first `resource "google_monitoring_alert_policy"` block:

```hcl
# ============================================================================
# NOTIFICATION CHANNELS
# ============================================================================

resource "google_monitoring_notification_channel" "email" {
  count        = var.notification_email != "" ? 1 : 0
  display_name = "Cesteral Alerts Email (${var.environment})"
  type         = "email"
  project      = var.project_id

  labels = {
    email_address = var.notification_email
  }
}

locals {
  effective_channels = var.notification_email != "" ? concat(
    var.notification_channels,
    [google_monitoring_notification_channel.email[0].name]
  ) : var.notification_channels
}
```

**Step 3: Wire the email channel into all existing alert policies**

In `terraform/modules/monitoring/main.tf`, for **each of the four** existing `google_monitoring_alert_policy` resources (`error_rate`, `latency_p99`, `instance_count`, `uptime_failure`), change:

```hcl
notification_channels = var.notification_channels
```

to:

```hcl
notification_channels = local.effective_channels
```

There are 4 occurrences — change all of them.

**Step 4: Add root-level variable and pass to module**

In `terraform/variables.tf`, append:

```hcl
variable "monitoring_notification_email" {
  description = "Email address for monitoring alert notifications"
  type        = string
  default     = ""
}
```

In `terraform/main.tf`, in the `module "monitoring"` block (around line 267), add:

```hcl
notification_email    = var.monitoring_notification_email
```

**Step 5: Validate**

```bash
cd terraform && terraform validate
```
Expected: `Success! The configuration is valid.`

**Step 6: Commit**

```bash
git add terraform/modules/monitoring/main.tf terraform/modules/monitoring/variables.tf terraform/variables.tf terraform/main.tf
git commit -m "feat(terraform): add email notification channel to monitoring module

Creates google_monitoring_notification_channel.email from
monitoring_notification_email variable and wires it to all
four existing alert policies via local.effective_channels."
```

---

### Task 4: Add Cloud Monitoring dashboard

**Files:**
- Modify: `terraform/modules/monitoring/main.tf`

**Step 1: Add the dashboard resource**

In `terraform/modules/monitoring/main.tf`, append this resource at the end of the file:

```hcl
# ============================================================================
# CLOUD MONITORING DASHBOARD
# ============================================================================

resource "google_monitoring_dashboard" "cesteral" {
  project = var.project_id

  dashboard_json = jsonencode({
    displayName = "Cesteral MCP Servers (${var.environment})"
    mosaicLayout = {
      columns = 12
      tiles = [
        # Row 1: Service uptime (full width)
        {
          xPos = 0, yPos = 0, width = 12, height = 3
          widget = {
            title = "Service Uptime"
            xyChart = {
              dataSets = [{
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" resource.type=\"uptime_url\""
                    aggregation = {
                      alignmentPeriod  = "300s"
                      perSeriesAligner = "ALIGN_FRACTION_TRUE"
                      groupByFields    = ["metric.labels.check_id"]
                    }
                  }
                }
                plotType = "LINE"
              }]
            }
          }
        },
        # Row 2 left: Request count by service
        {
          xPos = 0, yPos = 3, width = 6, height = 3
          widget = {
            title = "Request Count by Service"
            xyChart = {
              dataSets = [{
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "metric.type=\"run.googleapis.com/request_count\" resource.type=\"cloud_run_revision\""
                    aggregation = {
                      alignmentPeriod     = "60s"
                      perSeriesAligner    = "ALIGN_RATE"
                      crossSeriesReducer  = "REDUCE_SUM"
                      groupByFields       = ["resource.labels.service_name"]
                    }
                  }
                }
                plotType = "LINE"
              }]
            }
          }
        },
        # Row 2 right: P99 latency by service
        {
          xPos = 6, yPos = 3, width = 6, height = 3
          widget = {
            title = "P99 Latency by Service (ms)"
            xyChart = {
              dataSets = [{
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "metric.type=\"run.googleapis.com/request_latencies\" resource.type=\"cloud_run_revision\""
                    aggregation = {
                      alignmentPeriod     = "60s"
                      perSeriesAligner    = "ALIGN_PERCENTILE_99"
                      crossSeriesReducer  = "REDUCE_MAX"
                      groupByFields       = ["resource.labels.service_name"]
                    }
                  }
                }
                plotType = "LINE"
              }]
            }
          }
        },
        # Row 3 left: Tool execution count by tool name + status
        {
          xPos = 0, yPos = 6, width = 6, height = 3
          widget = {
            title = "Tool Executions (count/min)"
            xyChart = {
              dataSets = [{
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "metric.type=\"custom.googleapis.com/opentelemetry/mcp/tool/execution/count\""
                    aggregation = {
                      alignmentPeriod     = "60s"
                      perSeriesAligner    = "ALIGN_RATE"
                      crossSeriesReducer  = "REDUCE_SUM"
                      groupByFields       = ["metric.labels.tool_name", "metric.labels.status"]
                    }
                  }
                }
                plotType = "LINE"
              }]
            }
          }
        },
        # Row 3 right: Tool execution duration P99
        {
          xPos = 6, yPos = 6, width = 6, height = 3
          widget = {
            title = "Tool Execution Duration P99 (ms)"
            xyChart = {
              dataSets = [{
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "metric.type=\"custom.googleapis.com/opentelemetry/mcp/tool/execution/duration_ms\""
                    aggregation = {
                      alignmentPeriod     = "60s"
                      perSeriesAligner    = "ALIGN_PERCENTILE_99"
                      crossSeriesReducer  = "REDUCE_MAX"
                      groupByFields       = ["metric.labels.tool_name"]
                    }
                  }
                }
                plotType = "LINE"
              }]
            }
          }
        },
        # Row 4 left: Active sessions gauge
        {
          xPos = 0, yPos = 9, width = 6, height = 3
          widget = {
            title = "Active MCP Sessions"
            xyChart = {
              dataSets = [{
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "metric.type=\"custom.googleapis.com/opentelemetry/mcp/session/active\""
                    aggregation = {
                      alignmentPeriod    = "60s"
                      perSeriesAligner   = "ALIGN_MEAN"
                      crossSeriesReducer = "REDUCE_SUM"
                    }
                  }
                }
                plotType = "LINE"
              }]
            }
          }
        },
        # Row 4 right: Auth validation count
        {
          xPos = 6, yPos = 9, width = 6, height = 3
          widget = {
            title = "Auth Validations (success vs failure)"
            xyChart = {
              dataSets = [{
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "metric.type=\"custom.googleapis.com/opentelemetry/mcp/auth/validation/count\""
                    aggregation = {
                      alignmentPeriod     = "60s"
                      perSeriesAligner    = "ALIGN_RATE"
                      crossSeriesReducer  = "REDUCE_SUM"
                      groupByFields       = ["metric.labels.result"]
                    }
                  }
                }
                plotType = "LINE"
              }]
            }
          }
        }
      ]
    }
  })
}
```

> **Note on custom metric names:** The exact Cloud Monitoring metric type string for OTEL custom metrics depends on the exporter version. `custom.googleapis.com/opentelemetry/mcp/tool/execution/count` is the expected format for `@google-cloud/opentelemetry-cloud-monitoring-exporter`. If metric tiles show "no data" after first deployment, check the actual metric name in Cloud Monitoring → Metrics Explorer → filter by `custom.googleapis.com` and search for `mcp`.

**Step 2: Validate**

```bash
cd terraform && terraform validate
```
Expected: `Success! The configuration is valid.`

**Step 3: Commit**

```bash
git add terraform/modules/monitoring/main.tf
git commit -m "feat(terraform): add Cloud Monitoring dashboard for all 5 MCP servers

Six-row dashboard: uptime, request count, P99 latency, tool
execution count, tool duration P99, active sessions, auth stats."
```

---

### Task 5: Add log-based metric and audit-denial alert

**Files:**
- Modify: `terraform/modules/monitoring/main.tf`

**Step 1: Add log-based metric for audit access-denial events**

Append to `terraform/modules/monitoring/main.tf`:

```hcl
# ============================================================================
# LOG-BASED METRIC: Audit access denied events
# ============================================================================

resource "google_logging_metric" "audit_access_denied" {
  name    = "cesteral/audit_access_denied_${var.environment}"
  project = var.project_id

  filter = <<-EOT
    resource.type="cloud_run_revision"
    jsonPayload.component="audit"
    jsonPayload.event="tool_access_denied"
  EOT

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"
    display_name = "Cesteral Audit Access Denied"

    labels {
      key         = "tool"
      value_type  = "STRING"
      description = "MCP tool name that was denied"
    }

    labels {
      key         = "service"
      value_type  = "STRING"
      description = "Cloud Run service name"
    }
  }

  label_extractors = {
    "tool"    = "EXTRACT(jsonPayload.tool)"
    "service" = "EXTRACT(resource.labels.service_name)"
  }
}

# ============================================================================
# ALERT: Audit access denied spike
# ============================================================================

resource "google_monitoring_alert_policy" "audit_access_denied" {
  display_name = "Cesteral Audit Access Denied Spike (${var.environment})"
  project      = var.project_id
  combiner     = "OR"

  conditions {
    display_name = "Audit access denied > 10 in 5 minutes"

    condition_threshold {
      filter = <<-EOT
        resource.type="cloud_run_revision"
        AND metric.type="logging.googleapis.com/user/cesteral/audit_access_denied_${var.environment}"
      EOT

      comparison      = "COMPARISON_GT"
      threshold_value = 10
      duration        = "0s"

      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_SUM"
        cross_series_reducer = "REDUCE_SUM"
      }
    }
  }

  notification_channels = local.effective_channels

  alert_strategy {
    auto_close = "1800s"
  }

  documentation {
    content   = "More than 10 tool_access_denied audit events in 5 minutes in ${var.environment}. Check Cloud Logging: jsonPayload.component=\"audit\" AND jsonPayload.event=\"tool_access_denied\""
    mime_type = "text/markdown"
  }
}
```

**Step 2: Validate**

```bash
cd terraform && terraform validate
```
Expected: `Success! The configuration is valid.`

**Step 3: Commit**

```bash
git add terraform/modules/monitoring/main.tf
git commit -m "feat(terraform): add log-based metric and alert for audit access-denial events

google_logging_metric filters Cloud Logging for tool_access_denied
events. Alert fires if >10 denials occur within a 5-minute window."
```

---

### Task 6: Update .tfvars with monitoring configuration

**Files:**
- Modify: `terraform/dev.tfvars`
- Modify: `terraform/prod.tfvars`

**Step 1: Add monitoring config to dev.tfvars**

Append to `terraform/dev.tfvars`:

```hcl
# Monitoring
monitoring_notification_email = "daniel@cesteral.com"

# Fill in Cloud Run URLs after first `terraform apply` — get them from:
# gcloud run services list --region=europe-west2 --format="table(name,URL)"
monitoring_services = [
  { name = "dbm-mcp",   url = "https://dbm-mcp-placeholder.europe-west2.run.app" },
  { name = "dv360-mcp", url = "https://dv360-mcp-placeholder.europe-west2.run.app" },
  { name = "ttd-mcp",   url = "https://ttd-mcp-placeholder.europe-west2.run.app" },
  { name = "gads-mcp",  url = "https://gads-mcp-placeholder.europe-west2.run.app" },
  { name = "meta-mcp",  url = "https://meta-mcp-placeholder.europe-west2.run.app" },
]
```

**Step 2: Add same block to prod.tfvars**

Append to `terraform/prod.tfvars` (same structure, prod URLs also TBD):

```hcl
# Monitoring
monitoring_notification_email = "daniel@cesteral.com"

# Fill in Cloud Run URLs after first `terraform apply`
monitoring_services = [
  { name = "dbm-mcp",   url = "https://dbm-mcp-placeholder.europe-west2.run.app" },
  { name = "dv360-mcp", url = "https://dv360-mcp-placeholder.europe-west2.run.app" },
  { name = "ttd-mcp",   url = "https://ttd-mcp-placeholder.europe-west2.run.app" },
  { name = "gads-mcp",  url = "https://gads-mcp-placeholder.europe-west2.run.app" },
  { name = "meta-mcp",  url = "https://meta-mcp-placeholder.europe-west2.run.app" },
]
```

**Step 3: Run full test suite one final time**

```bash
pnpm run test
```
Expected: All tests pass.

**Step 4: Commit**

```bash
git add terraform/dev.tfvars terraform/prod.tfvars
git commit -m "chore(terraform): add monitoring email and service URLs to tfvars

URLs are placeholder — update with actual Cloud Run URLs from
gcloud run services list after first terraform apply."
```

---

## Post-Deployment Checklist

After `terraform apply` and a new container deploy:

1. **Get real Cloud Run URLs** and replace placeholders in `.tfvars`:
   ```bash
   gcloud run services list --region=europe-west2 --format="table(metadata.name,status.url)"
   ```
   Then re-run `terraform apply` to update uptime checks with real URLs.

2. **Verify traces appear** in Cloud Trace:
   - Make a tool call via MCP client
   - GCP Console → Cloud Trace → find trace named `tool.{tool_name}`

3. **Verify custom metrics appear** in Cloud Monitoring:
   - GCP Console → Monitoring → Metrics Explorer
   - Search for `custom.googleapis.com` and filter by `mcp`
   - If metric names differ from `custom.googleapis.com/opentelemetry/mcp/tool/execution/count`, update the dashboard metric filter strings in `terraform/modules/monitoring/main.tf` and re-apply.

4. **Verify email alert works**:
   - GCP Console → Monitoring → Alerting → find `Cesteral dbm-mcp Error Rate` policy
   - Click "Test notification" → confirm email arrives

5. **Check dashboard loads**:
   - GCP Console → Monitoring → Dashboards → `Cesteral MCP Servers (dev)`

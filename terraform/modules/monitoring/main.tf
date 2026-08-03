# Monitoring module for Cesteral MCP Servers
# Provides uptime checks and alerting policies for Cloud Run services.

# ============================================================================
# UPTIME CHECKS
# ============================================================================

# The expected status depends on the fleet's AUTH POSTURE, not on health.
#
# An uptime checker is an anonymous caller. When `allow_unauthenticated = false`
# — the production posture, and the current dev posture since the Phase D IAM
# lock — Cloud Run answers anonymous requests with 403 before the request ever
# reaches `/health`. Asserting 200 there does not test liveness; it asserts the
# fleet is publicly callable, which is the opposite of the intended posture and
# would fail permanently on a correctly-locked deployment.
#
# So 403 is the success condition under a locked posture: it proves TLS
# terminated and a live backend applied IAM. A 200 would mean the lock is GONE
# and the fleet is answering anonymous callers — which this check will then fail
# on, deliberately, because that is a security regression worth paging about.
resource "google_monitoring_uptime_check_config" "health" {
  for_each = { for s in var.services : s.name => s }

  display_name = "cesteral-${each.key}-health-${var.environment}"
  timeout      = "10s"
  period       = var.uptime_check_period
  project      = var.project_id

  http_check {
    path           = "/health"
    port           = 443
    use_ssl        = true
    validate_ssl   = true
    request_method = "GET"

    accepted_response_status_codes {
      status_value = var.expected_health_status
    }
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = replace(each.value.url, "https://", "")
    }
  }

  checker_type = "STATIC_IP_CHECKERS"
}

# ----------------------------------------------------------------------------
# Fleet load balancer (mcp.cesteral.com)
# ----------------------------------------------------------------------------
# The check above targets each service's OWN Cloud Run URL, which stays healthy
# whether or not the load balancer in front of it exists. That blind spot is not
# hypothetical: on 2026-07-27 a billing lapse had GCP reclaim the entire fleet LB
# — global address, forwarding rules, all 13 backend services, and the managed
# certificate — leaving `mcp.cesteral.com` pointed at a dead IP and failing at
# TLS connect. Every Cloud Run service stayed up, so nothing surfaced it. It was
# found days later, by accident, in a Terraform plan run for an unrelated change.
#
# This check exercises the path callers actually use: DNS → LB → path routing →
# backend → IAM. Per-service paths rather than one probe, so a single broken
# backend or a dropped path rule is distinguishable from the LB being gone.
#
# Same posture logic as above — 403 is success, and a TLS error, 502, or 000 is
# the LB failing.
resource "google_monitoring_uptime_check_config" "fleet_lb" {
  for_each = var.fleet_domain != "" ? { for s in var.services : s.name => s } : {}

  display_name = "cesteral-lb-${each.key}-${var.environment}"
  timeout      = "10s"
  period       = var.uptime_check_period
  project      = var.project_id

  http_check {
    # Path prefix routing on the shared LB: /{server}/health.
    path           = "/${replace(each.key, "-mcp", "")}/health"
    port           = 443
    use_ssl        = true
    validate_ssl   = true
    request_method = "GET"

    accepted_response_status_codes {
      status_value = var.expected_health_status
    }
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = var.fleet_domain
    }
  }

  checker_type = "STATIC_IP_CHECKERS"
}

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

# ============================================================================
# ALERT: Error Rate
# ============================================================================

resource "google_monitoring_alert_policy" "error_rate" {
  for_each = { for s in var.services : s.name => s }

  display_name = "Cesteral ${each.key} Error Rate > ${var.error_rate_threshold}% (${var.environment})"
  project      = var.project_id
  combiner     = "OR"

  conditions {
    display_name = "Cloud Run ${each.key} 5xx error percentage"

    condition_threshold {
      filter = <<-EOT
        resource.type = "cloud_run_revision"
        AND resource.labels.service_name = "${each.key}"
        AND metric.type = "run.googleapis.com/request_count"
        AND metric.labels.response_code_class = "5xx"
      EOT

      denominator_filter = <<-EOT
        resource.type = "cloud_run_revision"
        AND resource.labels.service_name = "${each.key}"
        AND metric.type = "run.googleapis.com/request_count"
      EOT

      comparison      = "COMPARISON_GT"
      threshold_value = var.error_rate_threshold / 100
      duration        = "300s"

      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_RATE"
        cross_series_reducer = "REDUCE_SUM"
      }

      denominator_aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_RATE"
        cross_series_reducer = "REDUCE_SUM"
      }
    }
  }

  notification_channels = local.effective_channels

  alert_strategy {
    auto_close = "1800s"
  }

  documentation {
    content   = "5xx error percentage for Cesteral ${each.key} exceeded ${var.error_rate_threshold}% in ${var.environment}. Check Cloud Run logs for details."
    mime_type = "text/markdown"
  }
}

# ============================================================================
# ALERT: P99 Latency
# ============================================================================

resource "google_monitoring_alert_policy" "latency_p99" {
  for_each = { for s in var.services : s.name => s }

  display_name = "Cesteral ${each.key} P99 Latency > ${var.latency_p99_threshold_ms}ms (${var.environment})"
  project      = var.project_id
  combiner     = "OR"

  conditions {
    display_name = "Cloud Run ${each.key} p99 latency"

    condition_threshold {
      filter = <<-EOT
        resource.type = "cloud_run_revision"
        AND resource.labels.service_name = "${each.key}"
        AND metric.type = "run.googleapis.com/request_latencies"
      EOT

      comparison      = "COMPARISON_GT"
      threshold_value = var.latency_p99_threshold_ms
      duration        = "300s"

      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_PERCENTILE_99"
        cross_series_reducer = "REDUCE_MAX"
      }
    }
  }

  notification_channels = local.effective_channels

  alert_strategy {
    auto_close = "1800s"
  }

  documentation {
    content   = "P99 latency for Cesteral ${each.key} exceeded ${var.latency_p99_threshold_ms}ms in ${var.environment}. Check Cloud Run metrics for details."
    mime_type = "text/markdown"
  }
}

# ============================================================================
# ALERT: Instance Count
# ============================================================================

resource "google_monitoring_alert_policy" "instance_count" {
  for_each = { for s in var.services : s.name => s }

  display_name = "Cesteral ${each.key} No Active Instances (${var.environment})"
  project      = var.project_id
  combiner     = "OR"

  conditions {
    display_name = "Cloud Run ${each.key} instance count = 0"

    condition_threshold {
      filter = <<-EOT
        resource.type = "cloud_run_revision"
        AND resource.labels.service_name = "${each.key}"
        AND metric.type = "run.googleapis.com/container/instance_count"
      EOT

      comparison      = "COMPARISON_LT"
      threshold_value = 1
      duration        = "600s"

      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_MAX"
        cross_series_reducer = "REDUCE_SUM"
      }
    }
  }

  notification_channels = local.effective_channels

  alert_strategy {
    auto_close = "1800s"
  }

  documentation {
    content   = "Cesteral ${each.key} has no active instances in ${var.environment} for >10 minutes. Service may be down."
    mime_type = "text/markdown"
  }
}

# ============================================================================
# ALERT: Uptime Check Failed
# ============================================================================

# Fleet-LB reachability. Separate from the per-service policy below because the
# failure means something different: the per-service alert says "this backend is
# unhealthy", this one says "callers cannot reach the fleet at all", which is the
# outage that went undetected on 2026-07-27.
resource "google_monitoring_alert_policy" "fleet_lb_failure" {
  for_each = var.fleet_domain != "" ? { for s in var.services : s.name => s } : {}

  display_name = "Cesteral LB ${each.key} Unreachable via ${var.fleet_domain} (${var.environment})"
  project      = var.project_id
  combiner     = "OR"

  conditions {
    display_name = "Fleet LB uptime failure for ${each.key}"

    condition_threshold {
      filter = <<-EOT
        resource.type = "uptime_url"
        AND metric.type = "monitoring.googleapis.com/uptime_check/check_passed"
        AND metric.labels.check_id = "${google_monitoring_uptime_check_config.fleet_lb[each.key].uptime_check_id}"
      EOT

      comparison      = "COMPARISON_GT"
      threshold_value = 1
      duration        = "300s"

      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_NEXT_OLDER"
        cross_series_reducer = "REDUCE_COUNT_FALSE"
      }
    }
  }

  notification_channels = local.effective_channels

  documentation {
    content   = <<-EOT
      `${var.fleet_domain}${"/"}${replace(each.key, "-mcp", "")}/health` stopped answering.

      This is the caller-facing path (DNS → LB → path routing → backend → IAM),
      so it fails for reasons the per-service checks cannot see — most notably the
      load balancer itself being gone, which happened on 2026-07-27 after a
      billing lapse and stayed invisible for days because every Cloud Run service
      remained healthy.

      Triage:
      1. Do the LB resources still exist?
         `gcloud compute forwarding-rules list --global`
         `gcloud compute addresses list --global`
         If empty, follow docs/runbooks/2026-07-27-dev-fleet-lb-recovery.md —
         recovery reallocates the IP and needs a DNS update plus certificate
         re-provisioning.
      2. Does DNS still resolve to the current LB address?
      3. Is the managed certificate ACTIVE?
      4. If the check began failing with 200 rather than a connection error, the
         IAM lock has been REMOVED and the fleet is answering anonymous callers.
         That is a security regression, not an availability one.
    EOT
    mime_type = "text/markdown"
  }
}

resource "google_monitoring_alert_policy" "uptime_failure" {
  for_each = { for s in var.services : s.name => s }

  display_name = "Cesteral ${each.key} Health Check Failed (${var.environment})"
  project      = var.project_id
  combiner     = "OR"

  conditions {
    display_name = "Uptime check failure for ${each.key}"

    condition_threshold {
      filter = <<-EOT
        resource.type = "uptime_url"
        AND metric.type = "monitoring.googleapis.com/uptime_check/check_passed"
        AND metric.labels.check_id = "${google_monitoring_uptime_check_config.health[each.key].uptime_check_id}"
      EOT

      comparison      = "COMPARISON_GT"
      threshold_value = 1
      duration        = "300s"

      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_NEXT_OLDER"
        cross_series_reducer = "REDUCE_COUNT_FALSE"
      }
    }
  }

  notification_channels = local.effective_channels

  alert_strategy {
    auto_close = "1800s"
  }

  documentation {
    content   = "Health check for Cesteral ${each.key} is failing in ${var.environment}. Service may be unhealthy."
    mime_type = "text/markdown"
  }
}

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
                      alignmentPeriod    = "60s"
                      perSeriesAligner   = "ALIGN_RATE"
                      crossSeriesReducer = "REDUCE_SUM"
                      groupByFields      = ["resource.labels.service_name"]
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
                      alignmentPeriod    = "60s"
                      perSeriesAligner   = "ALIGN_PERCENTILE_99"
                      crossSeriesReducer = "REDUCE_MAX"
                      groupByFields      = ["resource.labels.service_name"]
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
                    filter = "metric.type=\"workload.googleapis.com/mcp.tool.execution.count\""
                    aggregation = {
                      alignmentPeriod    = "60s"
                      perSeriesAligner   = "ALIGN_RATE"
                      crossSeriesReducer = "REDUCE_SUM"
                      groupByFields      = ["metric.labels.tool_name", "metric.labels.status"]
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
                    filter = "metric.type=\"workload.googleapis.com/mcp.tool.execution.duration_ms\""
                    aggregation = {
                      alignmentPeriod    = "60s"
                      perSeriesAligner   = "ALIGN_DELTA"
                      crossSeriesReducer = "REDUCE_PERCENTILE_99"
                      groupByFields      = ["metric.labels.tool_name"]
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
                    filter = "metric.type=\"workload.googleapis.com/mcp.session.active\""
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
                    filter = "metric.type=\"workload.googleapis.com/mcp.auth.validation.count\""
                    aggregation = {
                      alignmentPeriod    = "60s"
                      perSeriesAligner   = "ALIGN_RATE"
                      crossSeriesReducer = "REDUCE_SUM"
                      groupByFields      = ["metric.labels.result"]
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
    metric_kind  = "DELTA"
    value_type   = "INT64"
    unit         = "1"
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

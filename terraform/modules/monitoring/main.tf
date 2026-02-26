# Monitoring module for Cesteral MCP Servers
# Provides uptime checks and alerting policies for Cloud Run services.

# ============================================================================
# UPTIME CHECKS
# ============================================================================

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
      status_value = 200
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
    display_name = "Cloud Run ${each.key} 5xx error rate"

    condition_threshold {
      filter = <<-EOT
        resource.type = "cloud_run_revision"
        AND resource.labels.service_name = "${each.key}"
        AND metric.type = "run.googleapis.com/request_count"
        AND metric.labels.response_code_class = "5xx"
      EOT

      comparison      = "COMPARISON_GT"
      threshold_value = var.error_rate_threshold
      duration        = "300s"

      aggregations {
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
    content   = "Error rate for Cesteral ${each.key} exceeded ${var.error_rate_threshold}% in ${var.environment}. Check Cloud Run logs for details."
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

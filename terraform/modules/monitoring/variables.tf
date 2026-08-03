variable "project_id" {
  type        = string
  description = "GCP project ID"
}

variable "region" {
  type        = string
  description = "GCP region"
}

variable "environment" {
  type        = string
  description = "Environment name (dev, prod)"
}

variable "services" {
  type = list(object({
    name = string
    url  = string
  }))
  description = "List of Cloud Run services to monitor"
  default     = []
}

variable "notification_channels" {
  type        = list(string)
  description = "List of notification channel IDs for alerting"
  default     = []
}

variable "error_rate_threshold" {
  type        = number
  description = "5xx error percentage threshold for alerting (0-100)"
  default     = 5
  validation {
    condition     = var.error_rate_threshold >= 0 && var.error_rate_threshold <= 100
    error_message = "error_rate_threshold must be between 0 and 100."
  }
}

variable "latency_p99_threshold_ms" {
  type        = number
  description = "P99 latency threshold in milliseconds"
  default     = 5000
}

variable "uptime_check_period" {
  type        = string
  description = "Uptime check frequency (e.g., 60s, 300s)"
  default     = "300s"
}

variable "notification_email" {
  type        = string
  description = "Email address for alert notification channel. Empty string disables email channel."
  default     = ""
}

variable "fleet_domain" {
  description = <<-EOT
    Custom domain fronting the fleet load balancer (e.g. mcp.cesteral.com). When
    empty, the LB uptime checks and their alert policies are not created — a
    deployment without the shared LB has no such path to probe.
  EOT
  type        = string
  default     = ""
}

variable "expected_health_status" {
  description = <<-EOT
    HTTP status an ANONYMOUS caller should receive from /health.

    403 under the normal locked posture (`allow_unauthenticated = false`): the
    uptime checker is anonymous, so Cloud Run rejects it before /health runs. A
    403 still proves TLS terminated and a live backend applied IAM, which is what
    the check is for. 200 only when the fleet is deliberately public — asserting
    200 against a locked fleet fails permanently and tests the wrong property.
  EOT
  type        = number
  default     = 403

  validation {
    condition     = contains([200, 403], var.expected_health_status)
    error_message = "expected_health_status must be 200 (public) or 403 (IAM-locked)."
  }
}

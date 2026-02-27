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
  description = "Environment name (dev, staging, prod)"
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

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
  description = "Error rate threshold percentage for alerting"
  default     = 5
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

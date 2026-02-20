# Variables for MCP Service Module (parameterized per-service)

variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region for resources"
  type        = string
  default     = "europe-west2"
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be dev, staging, or prod."
  }
}

# ============================================================================
# SERVICE IDENTITY
# ============================================================================

variable "service_name" {
  description = "Name of the Cloud Run service (e.g., dbm-mcp, dv360-mcp, ttd-mcp)"
  type        = string
}

variable "container_port" {
  description = "Container port the service listens on"
  type        = number
  default     = 8080
}

# ============================================================================
# CLOUD RUN CONFIGURATION
# ============================================================================

variable "container_image" {
  description = "Container image URL for Cloud Run service"
  type        = string
}

variable "min_instances" {
  description = "Minimum number of Cloud Run instances"
  type        = number
  default     = 0
}

variable "max_instances" {
  description = "Maximum number of Cloud Run instances"
  type        = number
  default     = 10
}

variable "cpu_limit" {
  description = "CPU limit for Cloud Run container"
  type        = string
  default     = "1"
}

variable "memory_limit" {
  description = "Memory limit for Cloud Run container"
  type        = string
  default     = "512Mi"
}

variable "cpu_always_allocated" {
  description = "Whether CPU is always allocated (true) or only during requests (false)"
  type        = bool
  default     = false
}

variable "allow_unauthenticated" {
  description = "Allow unauthenticated access to Cloud Run service"
  type        = bool
  default     = false
}

variable "authorized_invokers" {
  description = "List of members authorized to invoke Cloud Run service"
  type        = list(string)
  default     = []
}

variable "vpc_connector_name" {
  description = "VPC connector name for private networking (full resource name)"
  type        = string
  default     = ""
}

# ============================================================================
# MCP SERVER CONFIGURATION
# ============================================================================

variable "mcp_session_mode" {
  description = "MCP session mode (stateless, stateful, auto)"
  type        = string
  default     = "stateless"
  validation {
    condition     = contains(["stateless", "stateful", "auto"], var.mcp_session_mode)
    error_message = "MCP session mode must be stateless, stateful, or auto."
  }
}

variable "mcp_auth_mode" {
  description = "MCP authentication mode (none, jwt, oauth)"
  type        = string
  default     = "jwt"
  validation {
    condition     = contains(["none", "jwt", "oauth"], var.mcp_auth_mode)
    error_message = "MCP auth mode must be none, jwt, or oauth."
  }
}

variable "log_level" {
  description = "Logging level (debug, info, warn, error)"
  type        = string
  default     = "info"
}

# ============================================================================
# SECRET MANAGER CONFIGURATION
# ============================================================================

variable "secret_names" {
  description = "List of secret names to create in Secret Manager"
  type        = list(string)
  default     = []
}

variable "secret_env_vars" {
  description = "Map of environment variable names to secret references"
  type = map(object({
    secret_name = string
    version     = string
  }))
  default = {}
}

# ============================================================================
# GCS PERSISTENCE
# ============================================================================

variable "enable_gcs_persistence" {
  description = "Enable GCS-backed persistence for learning system data"
  type        = bool
  default     = false
}

variable "gcs_bucket_name" {
  description = "GCS bucket name for learnings/findings persistence"
  type        = string
  default     = ""
  validation {
    condition     = !var.enable_gcs_persistence || length(trim(var.gcs_bucket_name)) > 0
    error_message = "gcs_bucket_name must be set when enable_gcs_persistence is true."
  }
}

# ============================================================================
# CLOUD SCHEDULER CONFIGURATION
# ============================================================================

variable "enable_scheduler_jobs" {
  description = "Enable Cloud Scheduler jobs for automated monitoring"
  type        = bool
  default     = false
}

variable "preflight_schedule" {
  description = "Cron schedule for pre-flight checks"
  type        = string
  default     = "0 6,14,22 * * *"
}

variable "inflight_schedule" {
  description = "Cron schedule for in-flight monitoring"
  type        = string
  default     = "0 * * * *"
}

variable "scheduler_timezone" {
  description = "Timezone for Cloud Scheduler jobs (IANA timezone)"
  type        = string
  default     = "America/New_York"
}

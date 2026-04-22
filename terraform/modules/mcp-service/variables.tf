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
  description = "Environment name (dev, prod)"
  type        = string
  validation {
    condition     = contains(["dev", "prod"], var.environment)
    error_message = "Environment must be dev or prod."
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

variable "mcp_auth_mode" {
  description = "MCP authentication mode for the target server"
  type        = string
  default     = "jwt"
  validation {
    condition     = length(trimspace(var.mcp_auth_mode)) > 0
    error_message = "MCP auth mode must be a non-empty string."
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

variable "interaction_log_mode" {
  description = "Destination for InteractionLogger entries: file | gcs | stdout. When unset, the server defaults to gcs if enable_gcs_persistence is true, else file."
  type        = string
  default     = ""
  validation {
    condition     = contains(["", "file", "gcs", "stdout"], var.interaction_log_mode)
    error_message = "interaction_log_mode must be one of: file, gcs, stdout (or empty for default)."
  }
}

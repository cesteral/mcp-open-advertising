# Variables for Core Infrastructure Module

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
  description = "List of members authorized to invoke Cloud Run service (e.g., serviceAccount:foo@project.iam.gserviceaccount.com)"
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
  default = [
    "cesteral-dv360-oauth-client-id",
    "cesteral-dv360-oauth-client-secret",
    "cesteral-dv360-refresh-token",
    "cesteral-bid-manager-api-key",
    "cesteral-beam-api-key",
    "cesteral-teams-app-id",
    "cesteral-teams-app-secret",
    "cesteral-jwt-secret-key"
  ]
}

variable "secret_env_vars" {
  description = "Map of environment variable names to secret references"
  type = map(object({
    secret_name = string
    version     = string
  }))
  default = {
    MCP_AUTH_SECRET_KEY = {
      secret_name = "cesteral-jwt-secret-key"
      version     = "latest"
    }
    DV360_OAUTH_CLIENT_ID = {
      secret_name = "cesteral-dv360-oauth-client-id"
      version     = "latest"
    }
    DV360_OAUTH_CLIENT_SECRET = {
      secret_name = "cesteral-dv360-oauth-client-secret"
      version     = "latest"
    }
    DV360_REFRESH_TOKEN = {
      secret_name = "cesteral-dv360-refresh-token"
      version     = "latest"
    }
    BID_MANAGER_API_KEY = {
      secret_name = "cesteral-bid-manager-api-key"
      version     = "latest"
    }
    BEAM_API_KEY = {
      secret_name = "cesteral-beam-api-key"
      version     = "latest"
    }
    TEAMS_APP_ID = {
      secret_name = "cesteral-teams-app-id"
      version     = "latest"
    }
    TEAMS_APP_SECRET = {
      secret_name = "cesteral-teams-app-secret"
      version     = "latest"
    }
  }
}

# ============================================================================
# CLOUD SCHEDULER CONFIGURATION
# ============================================================================

variable "enable_scheduler_jobs" {
  description = "Enable Cloud Scheduler jobs for automated monitoring"
  type        = bool
  default     = true
}

variable "preflight_schedule" {
  description = "Cron schedule for pre-flight checks (e.g., '0 */2 * * *' for every 2 hours)"
  type        = string
  default     = "0 6,14,22 * * *" # 6am, 2pm, 10pm daily
}

variable "inflight_schedule" {
  description = "Cron schedule for in-flight monitoring (e.g., '0 * * * *' for hourly)"
  type        = string
  default     = "0 * * * *" # Every hour
}

variable "scheduler_timezone" {
  description = "Timezone for Cloud Scheduler jobs (IANA timezone)"
  type        = string
  default     = "America/New_York"
}

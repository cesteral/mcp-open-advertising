# Root Terraform variables for Cesteral

# ============================================================================
# PROJECT CONFIGURATION
# ============================================================================

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
# CONTAINER REGISTRY CONFIGURATION
# ============================================================================

variable "artifact_registry_repo_name" {
  description = "Name of Artifact Registry repository"
  type        = string
  default     = "cesteral"
}

variable "dbm_mcp_image" {
  description = "Full container image URL for dbm-mcp server"
  type        = string
}

variable "dv360_mcp_image" {
  description = "Full container image URL for dv360-mcp server"
  type        = string
}

variable "ttd_mcp_image" {
  description = "Full container image URL for ttd-mcp server"
  type        = string
}

variable "gads_mcp_image" {
  description = "Full container image URL for gads-mcp server"
  type        = string
}

variable "meta_mcp_image" {
  description = "Full container image URL for meta-mcp server"
  type        = string
}

variable "linkedin_mcp_image" {
  description = "Full container image URL for linkedin-mcp server"
  type        = string
}

variable "tiktok_mcp_image" {
  description = "Full container image URL for tiktok-mcp server"
  type        = string
}

# ============================================================================
# NETWORKING VARIABLES
# ============================================================================

variable "create_vpc" {
  description = "Create a new VPC network"
  type        = bool
  default     = true
}

variable "existing_vpc_name" {
  description = "Name of existing VPC (if create_vpc = false)"
  type        = string
  default     = ""
}

variable "existing_subnet_name" {
  description = "Name of existing subnet (if create_vpc = false)"
  type        = string
  default     = ""
}

variable "serverless_subnet_cidr" {
  description = "CIDR range for serverless subnet"
  type        = string
  default     = "10.8.0.0/28"
}

variable "connector_machine_type" {
  description = "Machine type for VPC connector"
  type        = string
  default     = "e2-micro"
}

variable "connector_min_instances" {
  description = "Min VPC connector instances"
  type        = number
  default     = 2
}

variable "connector_max_instances" {
  description = "Max VPC connector instances"
  type        = number
  default     = 3
}

variable "connector_min_throughput" {
  description = "Min throughput in Mbps"
  type        = number
  default     = 200
}

variable "connector_max_throughput" {
  description = "Max throughput in Mbps"
  type        = number
  default     = 300
}

variable "enable_nat_logging" {
  description = "Enable Cloud NAT logging"
  type        = bool
  default     = true
}

variable "nat_log_filter" {
  description = "NAT log filter"
  type        = string
  default     = "ERRORS_ONLY"
}

variable "nat_min_ports_per_vm" {
  description = "Min ports per VM for NAT"
  type        = number
  default     = 64
}

variable "enable_endpoint_independent_mapping" {
  description = "Enable endpoint independent mapping for NAT"
  type        = bool
  default     = false
}

variable "allow_scheduler_ingress" {
  description = "Allow Cloud Scheduler ingress"
  type        = bool
  default     = true
}

# ============================================================================
# CLOUD RUN CONFIGURATION
# ============================================================================

variable "min_instances" {
  description = "Minimum Cloud Run instances"
  type        = number
  default     = 0
}

variable "max_instances" {
  description = "Maximum Cloud Run instances"
  type        = number
  default     = 10
}

variable "cpu_limit" {
  description = "CPU limit"
  type        = string
  default     = "1"
}

variable "memory_limit" {
  description = "Memory limit"
  type        = string
  default     = "512Mi"
}

variable "cpu_always_allocated" {
  description = "Keep CPU always allocated"
  type        = bool
  default     = false
}

variable "allow_unauthenticated" {
  description = "Allow unauthenticated access"
  type        = bool
  default     = false
}

variable "authorized_invokers" {
  description = "List of authorized invokers"
  type        = list(string)
  default     = []
}

variable "service_resource_overrides" {
  description = "Per-service Cloud Run resource overrides. Keys are service names (dbm-mcp, dv360-mcp, etc.)"
  type = map(object({
    min_instances = optional(number)
    max_instances = optional(number)
    cpu_limit     = optional(string)
    memory_limit  = optional(string)
  }))
  default = {}
}

# ============================================================================
# MCP SERVER CONFIGURATION
# ============================================================================

variable "mcp_session_mode" {
  description = "MCP session mode"
  type        = string
  default     = "stateless"
}

variable "mcp_auth_mode" {
  description = "MCP auth mode"
  type        = string
  default     = "jwt"
}

variable "log_level" {
  description = "Logging level"
  type        = string
  default     = "info"
}

# ============================================================================
# SECRET MANAGER CONFIGURATION
# ============================================================================

variable "dbm_secret_env_vars" {
  description = "Map of env vars to secrets for dbm-mcp"
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
  }
}

variable "dv360_secret_env_vars" {
  description = "Map of env vars to secrets for dv360-mcp"
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
  }
}

variable "ttd_secret_env_vars" {
  description = "Map of env vars to secrets for ttd-mcp"
  type = map(object({
    secret_name = string
    version     = string
  }))
  default = {
    MCP_AUTH_SECRET_KEY = {
      secret_name = "cesteral-jwt-secret-key"
      version     = "latest"
    }
    TTD_PARTNER_ID = {
      secret_name = "cesteral-ttd-partner-id"
      version     = "latest"
    }
    TTD_API_SECRET = {
      secret_name = "cesteral-ttd-api-secret"
      version     = "latest"
    }
  }
}

variable "gads_secret_env_vars" {
  description = "Map of env vars to secrets for gads-mcp"
  type = map(object({
    secret_name = string
    version     = string
  }))
  default = {
    MCP_AUTH_SECRET_KEY = {
      secret_name = "cesteral-jwt-secret-key"
      version     = "latest"
    }
    GADS_DEVELOPER_TOKEN = {
      secret_name = "cesteral-gads-developer-token"
      version     = "latest"
    }
    GADS_CLIENT_ID = {
      secret_name = "cesteral-gads-client-id"
      version     = "latest"
    }
    GADS_CLIENT_SECRET = {
      secret_name = "cesteral-gads-client-secret"
      version     = "latest"
    }
    GADS_REFRESH_TOKEN = {
      secret_name = "cesteral-gads-refresh-token"
      version     = "latest"
    }
  }
}

variable "meta_secret_env_vars" {
  description = "Map of env vars to secrets for meta-mcp"
  type = map(object({
    secret_name = string
    version     = string
  }))
  default = {
    MCP_AUTH_SECRET_KEY = {
      secret_name = "cesteral-jwt-secret-key"
      version     = "latest"
    }
    META_ACCESS_TOKEN = {
      secret_name = "cesteral-meta-access-token"
      version     = "latest"
    }
  }
}

variable "linkedin_secret_env_vars" {
  description = "Map of env vars to secrets for linkedin-mcp"
  type = map(object({
    secret_name = string
    version     = string
  }))
  default = {
    MCP_AUTH_SECRET_KEY = {
      secret_name = "cesteral-jwt-secret-key"
      version     = "latest"
    }
    LINKEDIN_ACCESS_TOKEN = {
      secret_name = "cesteral-linkedin-access-token"
      version     = "latest"
    }
  }
}

variable "tiktok_secret_env_vars" {
  description = "Map of env vars to secrets for tiktok-mcp"
  type = map(object({
    secret_name = string
    version     = string
  }))
  default = {
    MCP_AUTH_SECRET_KEY = {
      secret_name = "cesteral-jwt-secret-key"
      version     = "latest"
    }
    TIKTOK_ACCESS_TOKEN = {
      secret_name = "cesteral-tiktok-access-token"
      version     = "latest"
    }
    TIKTOK_ADVERTISER_ID = {
      secret_name = "cesteral-tiktok-advertiser-id"
      version     = "latest"
    }
  }
}

# ============================================================================
# GCS PERSISTENCE
# ============================================================================

variable "enable_gcs_persistence" {
  description = "Enable shared GCS-backed persistence for learning system data"
  type        = bool
  default     = false
}

variable "gcs_bucket_name" {
  description = "Shared GCS bucket name for learnings/findings/interaction logs"
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
  description = "Enable Cloud Scheduler jobs"
  type        = bool
  default     = true
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
  description = "Timezone for scheduler jobs"
  type        = string
  default     = "America/New_York"
}

# ============================================================================
# MONITORING CONFIGURATION
# ============================================================================

variable "monitoring_notification_channels" {
  description = "Notification channel IDs for monitoring alerts"
  type        = list(string)
  default     = []
}

variable "monitoring_error_rate_threshold" {
  description = "5xx error percentage threshold for alerting (0-100)"
  type        = number
  default     = 5
  validation {
    condition     = var.monitoring_error_rate_threshold >= 0 && var.monitoring_error_rate_threshold <= 100
    error_message = "monitoring_error_rate_threshold must be between 0 and 100."
  }
}

variable "monitoring_latency_p99_threshold_ms" {
  description = "P99 latency threshold in milliseconds for alerting"
  type        = number
  default     = 5000
}

variable "monitoring_uptime_check_period" {
  description = "Uptime check frequency"
  type        = string
  default     = "300s"
}

variable "monitoring_notification_email" {
  description = "Email address for monitoring alert notifications"
  type        = string
  default     = ""
}

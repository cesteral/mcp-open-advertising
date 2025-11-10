# Root Terraform variables for Campaign Guardian

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
  description = "Environment name (dev, staging, prod)"
  type        = string
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be dev, staging, or prod."
  }
}

# ============================================================================
# CONTAINER REGISTRY CONFIGURATION
# ============================================================================

variable "use_artifact_registry" {
  description = "Use Artifact Registry (true) or Container Registry (false)"
  type        = bool
  default     = true
}

variable "artifact_registry_repo_name" {
  description = "Name of Artifact Registry repository"
  type        = string
  default     = "campaign-guardian"
}

variable "container_image" {
  description = "Full container image URL (e.g., europe-west2-docker.pkg.dev/PROJECT/REPO/IMAGE:TAG)"
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

variable "secret_names" {
  description = "List of secret names to create"
  type        = list(string)
  default = [
    "campaign-guardian-dv360-oauth-client-id",
    "campaign-guardian-dv360-oauth-client-secret",
    "campaign-guardian-dv360-refresh-token",
    "campaign-guardian-bid-manager-api-key",
    "campaign-guardian-beam-api-key",
    "campaign-guardian-teams-app-id",
    "campaign-guardian-teams-app-secret",
    "campaign-guardian-jwt-secret-key"
  ]
}

variable "secret_env_vars" {
  description = "Map of env vars to secrets"
  type = map(object({
    secret_name = string
    version     = string
  }))
  default = {
    MCP_AUTH_SECRET_KEY = {
      secret_name = "campaign-guardian-jwt-secret-key"
      version     = "latest"
    }
    DV360_OAUTH_CLIENT_ID = {
      secret_name = "campaign-guardian-dv360-oauth-client-id"
      version     = "latest"
    }
    DV360_OAUTH_CLIENT_SECRET = {
      secret_name = "campaign-guardian-dv360-oauth-client-secret"
      version     = "latest"
    }
    DV360_REFRESH_TOKEN = {
      secret_name = "campaign-guardian-dv360-refresh-token"
      version     = "latest"
    }
    BID_MANAGER_API_KEY = {
      secret_name = "campaign-guardian-bid-manager-api-key"
      version     = "latest"
    }
    BEAM_API_KEY = {
      secret_name = "campaign-guardian-beam-api-key"
      version     = "latest"
    }
    TEAMS_APP_ID = {
      secret_name = "campaign-guardian-teams-app-id"
      version     = "latest"
    }
    TEAMS_APP_SECRET = {
      secret_name = "campaign-guardian-teams-app-secret"
      version     = "latest"
    }
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

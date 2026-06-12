# Root Terraform variables for Cesteral

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

variable "cm360_mcp_image" {
  description = "Full container image URL for cm360-mcp server"
  type        = string
}

variable "sa360_mcp_image" {
  description = "Full container image URL for sa360-mcp server"
  type        = string
}

variable "pinterest_mcp_image" {
  description = "Full container image URL for pinterest-mcp server"
  type        = string
}

variable "snapchat_mcp_image" {
  description = "Full container image URL for snapchat-mcp server"
  type        = string
}

variable "amazon_dsp_mcp_image" {
  description = "Full container image URL for amazon-dsp-mcp server"
  type        = string
}

variable "msads_mcp_image" {
  description = "Full container image URL for msads-mcp server"
  type        = string
}

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
  description = "Per-service Cloud Run resource overrides keyed by service name"
  type = map(object({
    min_instances = optional(number)
    max_instances = optional(number)
    cpu_limit     = optional(string)
    memory_limit  = optional(string)
  }))
  default = {}
}

variable "service_auth_mode_overrides" {
  description = "Per-service MCP auth mode overrides keyed by service name"
  type        = map(string)
  default     = {}
}

variable "log_level" {
  description = "Logging level"
  type        = string
  default     = "info"
}

variable "governance_token_mode" {
  description = "Fleet-wide decision-token enforcement mode (GOVERNANCE_TOKEN_MODE) for the Cesteral-operated deployment: off | warn | enforce. Defaults to 'warn' so the hosted fleet verifies and logs governance decision tokens without blocking writes; the in-code default remains 'off' so self-hosted / unconfigured servers stay neutral. Stage to 'enforce' per-contract via governance_token_enforce_contracts once end-to-end token parity is confirmed."
  type        = string
  default     = "warn"
  validation {
    condition     = contains(["", "off", "warn", "enforce"], var.governance_token_mode)
    error_message = "governance_token_mode must be one of: off, warn, enforce (or empty to leave unset)."
  }
}

variable "governance_token_secret_name" {
  description = "Name of the EXISTING Secret Manager secret holding the shared decision-token signing secret (GOVERNANCE_DECISION_TOKEN_SECRET). Shared by every service in the fleet and by the governance layer's mint side, so it is provisioned out-of-band (gcloud / console), never created by terraform. Threaded to every mcp-service module: each wires the env var and grants its runtime SA secretAccessor. Empty disables the wiring (warn-mode verdicts then read SECRET_UNCONFIGURED). See docs/governance/decision-token-rollout-and-rotation.md."
  type        = string
  default     = ""
}

variable "governance_token_secret_previous_name" {
  description = "Name of the EXISTING Secret Manager secret holding the previous decision-token signing secret (GOVERNANCE_DECISION_TOKEN_SECRET_PREVIOUS). Set ONLY while a zero-downtime rotation is in flight — the referenced secret must have at least one version or Cloud Run revision deploys fail. Empty (the steady state) leaves the env unset."
  type        = string
  default     = ""
}

variable "governance_token_enforce_contracts" {
  description = "contractIds staged into enforce mode via GOVERNANCE_TOKEN_MODE_ENFORCE_CONTRACTS (highest precedence in resolveTokenMode), letting proven contracts enforce while the fleet mode stays 'warn'. Add contracts only after their decision_token_verification audit lines show steady ok:true with definitionHashVerified:true — see the rollout runbook."
  type        = list(string)
  default     = []
}

variable "enable_required_apis" {
  description = "Manage the GCP service APIs the stack needs (run, secretmanager, vpcaccess, ...) as terraform resources with disable_on_destroy=false. Requires the deploying principal to hold roles/serviceusage.serviceUsageAdmin (granted to terraform-deployer by scripts/init-gcp-project.sh). Set false when APIs are managed out-of-band."
  type        = bool
  default     = true
}

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
    SERVICE_ACCOUNT_JSON = {
      secret_name = "cesteral-dbm-service-account-json"
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
    DV360_SERVICE_ACCOUNT_JSON = {
      secret_name = "cesteral-dv360-service-account-json"
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
    GADS_LOGIN_CUSTOMER_ID = {
      secret_name = "cesteral-gads-login-customer-id"
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
    META_APP_ID = {
      secret_name = "cesteral-meta-app-id"
      version     = "latest"
    }
    META_APP_SECRET = {
      secret_name = "cesteral-meta-app-secret"
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
    LINKEDIN_CLIENT_ID = {
      secret_name = "cesteral-linkedin-client-id"
      version     = "latest"
    }
    LINKEDIN_CLIENT_SECRET = {
      secret_name = "cesteral-linkedin-client-secret"
      version     = "latest"
    }
    LINKEDIN_REFRESH_TOKEN = {
      secret_name = "cesteral-linkedin-refresh-token"
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
    TIKTOK_APP_ID = {
      secret_name = "cesteral-tiktok-app-id"
      version     = "latest"
    }
    TIKTOK_APP_SECRET = {
      secret_name = "cesteral-tiktok-app-secret"
      version     = "latest"
    }
    TIKTOK_REFRESH_TOKEN = {
      secret_name = "cesteral-tiktok-refresh-token"
      version     = "latest"
    }
  }
}

variable "cm360_secret_env_vars" {
  description = "Map of env vars to secrets for cm360-mcp"
  type = map(object({
    secret_name = string
    version     = string
  }))
  default = {
    MCP_AUTH_SECRET_KEY = {
      secret_name = "cesteral-jwt-secret-key"
      version     = "latest"
    }
    CM360_SERVICE_ACCOUNT_JSON = {
      secret_name = "cesteral-cm360-service-account-json"
      version     = "latest"
    }
  }
}

variable "sa360_secret_env_vars" {
  description = "Map of env vars to secrets for sa360-mcp"
  type = map(object({
    secret_name = string
    version     = string
  }))
  default = {
    MCP_AUTH_SECRET_KEY = {
      secret_name = "cesteral-jwt-secret-key"
      version     = "latest"
    }
    SA360_CLIENT_ID = {
      secret_name = "cesteral-sa360-client-id"
      version     = "latest"
    }
    SA360_CLIENT_SECRET = {
      secret_name = "cesteral-sa360-client-secret"
      version     = "latest"
    }
    SA360_REFRESH_TOKEN = {
      secret_name = "cesteral-sa360-refresh-token"
      version     = "latest"
    }
    SA360_LOGIN_CUSTOMER_ID = {
      secret_name = "cesteral-sa360-login-customer-id"
      version     = "latest"
    }
  }
}

variable "pinterest_secret_env_vars" {
  description = "Map of env vars to secrets for pinterest-mcp"
  type = map(object({
    secret_name = string
    version     = string
  }))
  default = {
    MCP_AUTH_SECRET_KEY = {
      secret_name = "cesteral-jwt-secret-key"
      version     = "latest"
    }
    PINTEREST_ACCESS_TOKEN = {
      secret_name = "cesteral-pinterest-access-token"
      version     = "latest"
    }
    PINTEREST_AD_ACCOUNT_ID = {
      secret_name = "cesteral-pinterest-ad-account-id"
      version     = "latest"
    }
    PINTEREST_APP_ID = {
      secret_name = "cesteral-pinterest-app-id"
      version     = "latest"
    }
    PINTEREST_APP_SECRET = {
      secret_name = "cesteral-pinterest-app-secret"
      version     = "latest"
    }
    PINTEREST_REFRESH_TOKEN = {
      secret_name = "cesteral-pinterest-refresh-token"
      version     = "latest"
    }
  }
}

variable "snapchat_secret_env_vars" {
  description = "Map of env vars to secrets for snapchat-mcp"
  type = map(object({
    secret_name = string
    version     = string
  }))
  default = {
    MCP_AUTH_SECRET_KEY = {
      secret_name = "cesteral-jwt-secret-key"
      version     = "latest"
    }
    SNAPCHAT_ACCESS_TOKEN = {
      secret_name = "cesteral-snapchat-access-token"
      version     = "latest"
    }
    SNAPCHAT_AD_ACCOUNT_ID = {
      secret_name = "cesteral-snapchat-ad-account-id"
      version     = "latest"
    }
    SNAPCHAT_ORG_ID = {
      secret_name = "cesteral-snapchat-org-id"
      version     = "latest"
    }
    SNAPCHAT_APP_ID = {
      secret_name = "cesteral-snapchat-app-id"
      version     = "latest"
    }
    SNAPCHAT_APP_SECRET = {
      secret_name = "cesteral-snapchat-app-secret"
      version     = "latest"
    }
    SNAPCHAT_REFRESH_TOKEN = {
      secret_name = "cesteral-snapchat-refresh-token"
      version     = "latest"
    }
  }
}

variable "amazon_dsp_secret_env_vars" {
  description = "Map of env vars to secrets for amazon-dsp-mcp"
  type = map(object({
    secret_name = string
    version     = string
  }))
  default = {
    MCP_AUTH_SECRET_KEY = {
      secret_name = "cesteral-jwt-secret-key"
      version     = "latest"
    }
    AMAZON_DSP_ACCESS_TOKEN = {
      secret_name = "cesteral-amazon-dsp-access-token"
      version     = "latest"
    }
    AMAZON_DSP_PROFILE_ID = {
      secret_name = "cesteral-amazon-dsp-profile-id"
      version     = "latest"
    }
    AMAZON_DSP_CLIENT_ID = {
      secret_name = "cesteral-amazon-dsp-client-id"
      version     = "latest"
    }
    AMAZON_DSP_APP_ID = {
      secret_name = "cesteral-amazon-dsp-app-id"
      version     = "latest"
    }
    AMAZON_DSP_APP_SECRET = {
      secret_name = "cesteral-amazon-dsp-app-secret"
      version     = "latest"
    }
    AMAZON_DSP_REFRESH_TOKEN = {
      secret_name = "cesteral-amazon-dsp-refresh-token"
      version     = "latest"
    }
  }
}

variable "msads_secret_env_vars" {
  description = "Map of env vars to secrets for msads-mcp"
  type = map(object({
    secret_name = string
    version     = string
  }))
  default = {
    MCP_AUTH_SECRET_KEY = {
      secret_name = "cesteral-jwt-secret-key"
      version     = "latest"
    }
    MSADS_ACCESS_TOKEN = {
      secret_name = "cesteral-msads-access-token"
      version     = "latest"
    }
    MSADS_DEVELOPER_TOKEN = {
      secret_name = "cesteral-msads-developer-token"
      version     = "latest"
    }
    MSADS_CUSTOMER_ID = {
      secret_name = "cesteral-msads-customer-id"
      version     = "latest"
    }
    MSADS_ACCOUNT_ID = {
      secret_name = "cesteral-msads-account-id"
      version     = "latest"
    }
  }
}

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
    condition     = !var.enable_gcs_persistence || length(trimspace(var.gcs_bucket_name)) > 0
    error_message = "gcs_bucket_name must be set when enable_gcs_persistence is true."
  }
}

variable "enable_report_spill" {
  description = "Enable GCS-backed CSV spill for large reports (REPORT_SPILL_BUCKET)"
  type        = bool
  default     = false
}

variable "report_spill_bucket_name" {
  description = "GCS bucket name for the report CSV spill feature. Objects are short-lived (24h lifecycle)."
  type        = string
  default     = ""
  validation {
    condition     = !var.enable_report_spill || length(trimspace(var.report_spill_bucket_name)) > 0
    error_message = "report_spill_bucket_name must be set when enable_report_spill is true."
  }
}

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

variable "enable_fleet_lb" {
  description = "Provision the global HTTPS load balancer serving every MCP server under fleet_domain with path-based routing. Adds the LB origin to each service's accepted ID-token audiences."
  type        = bool
  default     = false
}

variable "fleet_domain" {
  description = "Domain the fleet load balancer serves (e.g. mcp.cesteral.com). Required when enable_fleet_lb is true; DNS for it must point at the LB IP output before the managed certificate can provision."
  type        = string
  default     = ""

  validation {
    condition     = var.fleet_domain == "" || can(regex("^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$", var.fleet_domain))
    error_message = "fleet_domain must be a bare FQDN (no scheme, no path, no trailing dot)."
  }
}

variable "fleet_redirect_host" {
  description = "Host the fleet load balancer redirects unmatched paths to (the public website)."
  type        = string
  default     = "cesteral.com"
}

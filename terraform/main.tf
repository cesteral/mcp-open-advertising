# Root Terraform configuration for BidShifter MCP Servers
# Orchestrates networking and core infrastructure modules

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }

  backend "gcs" {
    # Backend configuration is provided via backend config file or CLI
    # See backend-{env}.conf files
  }
}

# ============================================================================
# PROVIDERS
# ============================================================================

provider "google" {
  project = var.project_id
  region  = var.region
}

# ============================================================================
# DATA SOURCES
# ============================================================================

data "google_project" "project" {
  project_id = var.project_id
}

# Artifact Registry repository (must be created separately or via init script)
data "google_artifact_registry_repository" "container_repo" {
  count = var.use_artifact_registry ? 1 : 0

  project       = var.project_id
  location      = var.region
  repository_id = var.artifact_registry_repo_name
}

# ============================================================================
# NETWORKING MODULE
# ============================================================================

module "networking" {
  source = "./modules/networking"

  project_id  = var.project_id
  region      = var.region
  environment = var.environment

  # VPC configuration
  create_vpc             = var.create_vpc
  existing_vpc_name      = var.existing_vpc_name
  existing_subnet_name   = var.existing_subnet_name
  serverless_subnet_cidr = var.serverless_subnet_cidr

  # VPC connector configuration
  connector_machine_type  = var.connector_machine_type
  connector_min_instances = var.connector_min_instances
  connector_max_instances = var.connector_max_instances
  connector_min_throughput = var.connector_min_throughput
  connector_max_throughput = var.connector_max_throughput

  # Cloud NAT configuration
  enable_nat_logging                  = var.enable_nat_logging
  nat_log_filter                      = var.nat_log_filter
  nat_min_ports_per_vm                = var.nat_min_ports_per_vm
  enable_endpoint_independent_mapping = var.enable_endpoint_independent_mapping

  # Firewall configuration
  allow_scheduler_ingress = var.allow_scheduler_ingress
}

# ============================================================================
# CORE INFRASTRUCTURE MODULE
# ============================================================================

module "core_infrastructure" {
  source = "./modules/core-infrastructure"

  project_id  = var.project_id
  region      = var.region
  environment = var.environment

  # Cloud Run configuration
  container_image        = var.container_image
  min_instances          = var.min_instances
  max_instances          = var.max_instances
  cpu_limit              = var.cpu_limit
  memory_limit           = var.memory_limit
  cpu_always_allocated   = var.cpu_always_allocated
  allow_unauthenticated  = var.allow_unauthenticated
  authorized_invokers    = var.authorized_invokers
  vpc_connector_name     = module.networking.vpc_connector_id

  # MCP server configuration
  mcp_session_mode = var.mcp_session_mode
  mcp_auth_mode    = var.mcp_auth_mode
  log_level        = var.log_level

  # Secret Manager configuration
  secret_names    = var.secret_names
  secret_env_vars = var.secret_env_vars

  # Cloud Scheduler configuration
  enable_scheduler_jobs = var.enable_scheduler_jobs
  preflight_schedule    = var.preflight_schedule
  inflight_schedule     = var.inflight_schedule
  scheduler_timezone    = var.scheduler_timezone

  depends_on = [module.networking]
}

# ============================================================================
# MONITORING MODULE
# ============================================================================

module "monitoring" {
  source = "./modules/monitoring"

  project_id  = var.project_id
  region      = var.region
  environment = var.environment

  services              = var.monitoring_services
  notification_channels = var.monitoring_notification_channels

  error_rate_threshold     = var.monitoring_error_rate_threshold
  latency_p99_threshold_ms = var.monitoring_latency_p99_threshold_ms
  uptime_check_period      = var.monitoring_uptime_check_period

  depends_on = [module.core_infrastructure]
}

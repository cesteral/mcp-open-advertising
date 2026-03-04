# Root Terraform configuration for Cesteral MCP Servers
# Orchestrates networking, five MCP service modules, and monitoring

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.45"
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

# Artifact Registry repository with cleanup policies
resource "google_artifact_registry_repository" "container_repo" {
  project       = var.project_id
  location      = var.region
  repository_id = var.artifact_registry_repo_name
  format        = "DOCKER"
  description   = "Container images for Cesteral MCP servers"

  labels = {
    application = "cesteral"
    environment = var.environment
    managed_by  = "terraform"
  }

  # Keep last 10 tagged images per package
  cleanup_policies {
    id     = "keep-tagged-images"
    action = "KEEP"

    most_recent_versions {
      keep_count = 10
    }
  }

  # Delete untagged images older than 7 days
  cleanup_policies {
    id     = "delete-stale-untagged"
    action = "DELETE"

    condition {
      tag_state  = "UNTAGGED"
      older_than = "604800s" # 7 days
    }
  }
}

# ============================================================================
# SHARED GCS PERSISTENCE BUCKET
# ============================================================================

resource "google_storage_bucket" "gcs_persistence" {
  count    = var.enable_gcs_persistence ? 1 : 0
  name     = var.gcs_bucket_name
  location = var.region
  project  = var.project_id

  uniform_bucket_level_access = true

  labels = {
    application = "cesteral"
    environment = var.environment
    managed_by  = "terraform"
  }

  lifecycle_rule {
    condition { age = 90 }
    action { type = "Delete" }
  }
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
  connector_machine_type   = var.connector_machine_type
  connector_min_instances  = var.connector_min_instances
  connector_max_instances  = var.connector_max_instances
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
# SECRET CONFIGURATION — single source of truth
# secret_names are derived from secret_env_vars to eliminate dual-maintenance
# ============================================================================

locals {
  dbm_secret_names   = distinct(values({ for k, v in var.dbm_secret_env_vars : k => v.secret_name }))
  dv360_secret_names = distinct(values({ for k, v in var.dv360_secret_env_vars : k => v.secret_name }))
  ttd_secret_names   = distinct(values({ for k, v in var.ttd_secret_env_vars : k => v.secret_name }))
  gads_secret_names  = distinct(values({ for k, v in var.gads_secret_env_vars : k => v.secret_name }))
  meta_secret_names  = distinct(values({ for k, v in var.meta_secret_env_vars : k => v.secret_name }))
  linkedin_secret_names = distinct(values({ for k, v in var.linkedin_secret_env_vars : k => v.secret_name }))
  tiktok_secret_names = distinct(values({ for k, v in var.tiktok_secret_env_vars : k => v.secret_name }))
}

# ============================================================================
# PER-SERVICE RESOURCE OVERRIDES
# ============================================================================

locals {
  service_defaults = {
    min_instances = var.min_instances
    max_instances = var.max_instances
    cpu_limit     = var.cpu_limit
    memory_limit  = var.memory_limit
  }

  empty_service_override = {
    min_instances = null
    max_instances = null
    cpu_limit     = null
    memory_limit  = null
  }

  # Merge per-service overrides with defaults
  dbm_resources   = merge(local.service_defaults, { for k, v in lookup(var.service_resource_overrides, "dbm-mcp", local.empty_service_override) : k => v if v != null })
  dv360_resources = merge(local.service_defaults, { for k, v in lookup(var.service_resource_overrides, "dv360-mcp", local.empty_service_override) : k => v if v != null })
  ttd_resources   = merge(local.service_defaults, { for k, v in lookup(var.service_resource_overrides, "ttd-mcp", local.empty_service_override) : k => v if v != null })
  gads_resources  = merge(local.service_defaults, { for k, v in lookup(var.service_resource_overrides, "gads-mcp", local.empty_service_override) : k => v if v != null })
  meta_resources  = merge(local.service_defaults, { for k, v in lookup(var.service_resource_overrides, "meta-mcp", local.empty_service_override) : k => v if v != null })
  linkedin_resources  = merge(local.service_defaults, { for k, v in lookup(var.service_resource_overrides, "linkedin-mcp", local.empty_service_override) : k => v if v != null })
  tiktok_resources  = merge(local.service_defaults, { for k, v in lookup(var.service_resource_overrides, "tiktok-mcp", local.empty_service_override) : k => v if v != null })
}

# ============================================================================
# MCP SERVICE MODULES (one per server)
# ============================================================================

module "dbm_mcp" {
  source = "./modules/mcp-service"

  service_name    = "dbm-mcp"
  container_image = var.dbm_mcp_image

  project_id  = var.project_id
  region      = var.region
  environment = var.environment

  # Cloud Run configuration
  min_instances         = local.dbm_resources.min_instances
  max_instances         = local.dbm_resources.max_instances
  cpu_limit             = local.dbm_resources.cpu_limit
  memory_limit          = local.dbm_resources.memory_limit
  cpu_always_allocated  = var.cpu_always_allocated
  allow_unauthenticated = var.allow_unauthenticated
  authorized_invokers   = var.authorized_invokers
  vpc_connector_name    = module.networking.vpc_connector_id

  # MCP server configuration
  mcp_session_mode       = var.mcp_session_mode
  mcp_auth_mode          = var.mcp_auth_mode
  log_level              = var.log_level
  enable_gcs_persistence = var.enable_gcs_persistence
  gcs_bucket_name        = var.gcs_bucket_name

  # Secrets (dbm-specific — derived from secret_env_vars)
  secret_names    = local.dbm_secret_names
  secret_env_vars = var.dbm_secret_env_vars

  # Scheduler jobs (reporting server runs preflight/inflight)
  enable_scheduler_jobs = var.enable_scheduler_jobs
  preflight_schedule    = var.preflight_schedule
  inflight_schedule     = var.inflight_schedule
  scheduler_timezone    = var.scheduler_timezone

  depends_on = [module.networking, google_storage_bucket.gcs_persistence]
}

module "dv360_mcp" {
  source = "./modules/mcp-service"

  service_name    = "dv360-mcp"
  container_image = var.dv360_mcp_image

  project_id  = var.project_id
  region      = var.region
  environment = var.environment

  # Cloud Run configuration
  min_instances         = local.dv360_resources.min_instances
  max_instances         = local.dv360_resources.max_instances
  cpu_limit             = local.dv360_resources.cpu_limit
  memory_limit          = local.dv360_resources.memory_limit
  cpu_always_allocated  = var.cpu_always_allocated
  allow_unauthenticated = var.allow_unauthenticated
  authorized_invokers   = var.authorized_invokers
  vpc_connector_name    = module.networking.vpc_connector_id

  # MCP server configuration
  mcp_session_mode       = var.mcp_session_mode
  mcp_auth_mode          = var.mcp_auth_mode
  log_level              = var.log_level
  enable_gcs_persistence = var.enable_gcs_persistence
  gcs_bucket_name        = var.gcs_bucket_name

  # Secrets (dv360-specific — derived from secret_env_vars)
  secret_names    = local.dv360_secret_names
  secret_env_vars = var.dv360_secret_env_vars

  # No scheduler jobs for management server
  enable_scheduler_jobs = false

  depends_on = [module.networking, google_storage_bucket.gcs_persistence]
}

module "ttd_mcp" {
  source = "./modules/mcp-service"

  service_name    = "ttd-mcp"
  container_image = var.ttd_mcp_image

  project_id  = var.project_id
  region      = var.region
  environment = var.environment

  # Cloud Run configuration
  min_instances         = local.ttd_resources.min_instances
  max_instances         = local.ttd_resources.max_instances
  cpu_limit             = local.ttd_resources.cpu_limit
  memory_limit          = local.ttd_resources.memory_limit
  cpu_always_allocated  = var.cpu_always_allocated
  allow_unauthenticated = var.allow_unauthenticated
  authorized_invokers   = var.authorized_invokers
  vpc_connector_name    = module.networking.vpc_connector_id

  # MCP server configuration
  mcp_session_mode       = var.mcp_session_mode
  mcp_auth_mode          = var.mcp_auth_mode
  log_level              = var.log_level
  enable_gcs_persistence = var.enable_gcs_persistence
  gcs_bucket_name        = var.gcs_bucket_name

  # Secrets (ttd-specific — derived from secret_env_vars)
  secret_names    = local.ttd_secret_names
  secret_env_vars = var.ttd_secret_env_vars

  # No scheduler jobs for TTD server
  enable_scheduler_jobs = false

  depends_on = [module.networking, google_storage_bucket.gcs_persistence]
}

# ============================================================================
# GOOGLE ADS MCP SERVICE
# ============================================================================

module "gads_mcp" {
  source = "./modules/mcp-service"

  service_name    = "gads-mcp"
  container_image = var.gads_mcp_image

  project_id  = var.project_id
  region      = var.region
  environment = var.environment

  # Cloud Run configuration
  min_instances         = local.gads_resources.min_instances
  max_instances         = local.gads_resources.max_instances
  cpu_limit             = local.gads_resources.cpu_limit
  memory_limit          = local.gads_resources.memory_limit
  cpu_always_allocated  = var.cpu_always_allocated
  allow_unauthenticated = var.allow_unauthenticated
  authorized_invokers   = var.authorized_invokers
  vpc_connector_name    = module.networking.vpc_connector_id

  # MCP server configuration
  mcp_session_mode       = var.mcp_session_mode
  mcp_auth_mode          = var.mcp_auth_mode
  log_level              = var.log_level
  enable_gcs_persistence = var.enable_gcs_persistence
  gcs_bucket_name        = var.gcs_bucket_name

  # Secrets (gads-specific — derived from secret_env_vars)
  secret_names    = local.gads_secret_names
  secret_env_vars = var.gads_secret_env_vars

  # No scheduler jobs for GAds server
  enable_scheduler_jobs = false

  depends_on = [module.networking, google_storage_bucket.gcs_persistence]
}

# ============================================================================
# META ADS MCP SERVICE
# ============================================================================

module "meta_mcp" {
  source = "./modules/mcp-service"

  service_name    = "meta-mcp"
  container_image = var.meta_mcp_image

  project_id  = var.project_id
  region      = var.region
  environment = var.environment

  # Cloud Run configuration
  min_instances         = local.meta_resources.min_instances
  max_instances         = local.meta_resources.max_instances
  cpu_limit             = local.meta_resources.cpu_limit
  memory_limit          = local.meta_resources.memory_limit
  cpu_always_allocated  = var.cpu_always_allocated
  allow_unauthenticated = var.allow_unauthenticated
  authorized_invokers   = var.authorized_invokers
  vpc_connector_name    = module.networking.vpc_connector_id

  # MCP server configuration
  mcp_session_mode       = var.mcp_session_mode
  mcp_auth_mode          = var.mcp_auth_mode
  log_level              = var.log_level
  enable_gcs_persistence = var.enable_gcs_persistence
  gcs_bucket_name        = var.gcs_bucket_name

  # Secrets (meta-specific — derived from secret_env_vars)
  secret_names    = local.meta_secret_names
  secret_env_vars = var.meta_secret_env_vars

  # No scheduler jobs for Meta server
  enable_scheduler_jobs = false

  depends_on = [module.networking, google_storage_bucket.gcs_persistence]
}

# ============================================================================
# LINKEDIN ADS MCP SERVICE
# ============================================================================

module "linkedin_mcp" {
  source = "./modules/mcp-service"

  service_name    = "linkedin-mcp"
  container_image = var.linkedin_mcp_image

  project_id  = var.project_id
  region      = var.region
  environment = var.environment

  # Cloud Run configuration
  min_instances         = local.linkedin_resources.min_instances
  max_instances         = local.linkedin_resources.max_instances
  cpu_limit             = local.linkedin_resources.cpu_limit
  memory_limit          = local.linkedin_resources.memory_limit
  cpu_always_allocated  = var.cpu_always_allocated
  allow_unauthenticated = var.allow_unauthenticated
  authorized_invokers   = var.authorized_invokers
  vpc_connector_name    = module.networking.vpc_connector_id

  # MCP server configuration
  mcp_session_mode       = var.mcp_session_mode
  mcp_auth_mode          = var.mcp_auth_mode
  log_level              = var.log_level
  enable_gcs_persistence = var.enable_gcs_persistence
  gcs_bucket_name        = var.gcs_bucket_name

  # Secrets (linkedin-specific — derived from secret_env_vars)
  secret_names    = local.linkedin_secret_names
  secret_env_vars = var.linkedin_secret_env_vars

  # No scheduler jobs for LinkedIn server
  enable_scheduler_jobs = false

  depends_on = [module.networking, google_storage_bucket.gcs_persistence]
}

# ============================================================================
# TIKTOK ADS MCP SERVICE
# ============================================================================

module "tiktok_mcp" {
  source = "./modules/mcp-service"

  service_name    = "tiktok-mcp"
  container_image = var.tiktok_mcp_image

  project_id  = var.project_id
  region      = var.region
  environment = var.environment

  # Cloud Run configuration
  min_instances         = local.tiktok_resources.min_instances
  max_instances         = local.tiktok_resources.max_instances
  cpu_limit             = local.tiktok_resources.cpu_limit
  memory_limit          = local.tiktok_resources.memory_limit
  cpu_always_allocated  = var.cpu_always_allocated
  allow_unauthenticated = var.allow_unauthenticated
  authorized_invokers   = var.authorized_invokers
  vpc_connector_name    = module.networking.vpc_connector_id

  # MCP server configuration
  mcp_session_mode       = var.mcp_session_mode
  mcp_auth_mode          = var.mcp_auth_mode
  log_level              = var.log_level
  enable_gcs_persistence = var.enable_gcs_persistence
  gcs_bucket_name        = var.gcs_bucket_name

  # Secrets (tiktok-specific — derived from secret_env_vars)
  secret_names    = local.tiktok_secret_names
  secret_env_vars = var.tiktok_secret_env_vars

  # No scheduler jobs for TikTok server
  enable_scheduler_jobs = false

  depends_on = [module.networking, google_storage_bucket.gcs_persistence]
}

# ============================================================================
# MONITORING MODULE
# ============================================================================

module "monitoring" {
  source = "./modules/monitoring"

  project_id  = var.project_id
  region      = var.region
  environment = var.environment

  services = [
    { name = "dbm-mcp", url = module.dbm_mcp.cloud_run_service_url },
    { name = "dv360-mcp", url = module.dv360_mcp.cloud_run_service_url },
    { name = "ttd-mcp", url = module.ttd_mcp.cloud_run_service_url },
    { name = "gads-mcp", url = module.gads_mcp.cloud_run_service_url },
    { name = "meta-mcp", url = module.meta_mcp.cloud_run_service_url },
    { name = "linkedin-mcp", url = module.linkedin_mcp.cloud_run_service_url },
    { name = "tiktok-mcp", url = module.tiktok_mcp.cloud_run_service_url },
  ]
  notification_channels = var.monitoring_notification_channels
  notification_email    = var.monitoring_notification_email

  error_rate_threshold     = var.monitoring_error_rate_threshold
  latency_p99_threshold_ms = var.monitoring_latency_p99_threshold_ms
  uptime_check_period      = var.monitoring_uptime_check_period
}

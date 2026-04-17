# Root Terraform configuration for Cesteral MCP Servers

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.45"
    }
  }

  backend "gcs" {}
}

provider "google" {
  project = var.project_id
  region  = var.region
}

data "google_project" "project" {
  project_id = var.project_id
}

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

  cleanup_policies {
    id     = "keep-tagged-images"
    action = "KEEP"

    most_recent_versions {
      keep_count = 10
    }
  }

  cleanup_policies {
    id     = "delete-stale-untagged"
    action = "DELETE"

    condition {
      tag_state  = "UNTAGGED"
      older_than = "604800s"
    }
  }
}

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

# Report-CSV spill bucket. Populated by the shared spillCsvToGcs helper
# whenever REPORT_SPILL_BUCKET is set and a downloaded report exceeds the
# byte/row threshold. Objects are expected to be ephemeral — the
# 1-day lifecycle rule is the primary cost control; per-session cleanup
# hooks (packages/shared/src/utils/report-spill.ts#deleteSpilledObjectsForSession)
# best-effort delete objects sooner.
resource "google_storage_bucket" "report_spill" {
  count    = var.enable_report_spill ? 1 : 0
  name     = var.report_spill_bucket_name
  location = var.region
  project  = var.project_id

  uniform_bucket_level_access = true

  labels = {
    application = "cesteral"
    environment = var.environment
    managed_by  = "terraform"
    purpose     = "report-csv-spill"
  }

  lifecycle_rule {
    condition { age = 1 }
    action { type = "Delete" }
  }
}

module "networking" {
  source = "./modules/networking"

  project_id  = var.project_id
  region      = var.region
  environment = var.environment

  create_vpc                          = var.create_vpc
  existing_vpc_name                   = var.existing_vpc_name
  existing_subnet_name                = var.existing_subnet_name
  serverless_subnet_cidr              = var.serverless_subnet_cidr
  connector_machine_type              = var.connector_machine_type
  connector_min_instances             = var.connector_min_instances
  connector_max_instances             = var.connector_max_instances
  connector_min_throughput            = var.connector_min_throughput
  connector_max_throughput            = var.connector_max_throughput
  enable_nat_logging                  = var.enable_nat_logging
  nat_log_filter                      = var.nat_log_filter
  nat_min_ports_per_vm                = var.nat_min_ports_per_vm
  enable_endpoint_independent_mapping = var.enable_endpoint_independent_mapping
}

locals {
  dbm_secret_names        = distinct(values({ for k, v in var.dbm_secret_env_vars : k => v.secret_name }))
  dv360_secret_names      = distinct(values({ for k, v in var.dv360_secret_env_vars : k => v.secret_name }))
  ttd_secret_names        = distinct(values({ for k, v in var.ttd_secret_env_vars : k => v.secret_name }))
  gads_secret_names       = distinct(values({ for k, v in var.gads_secret_env_vars : k => v.secret_name }))
  meta_secret_names       = distinct(values({ for k, v in var.meta_secret_env_vars : k => v.secret_name }))
  linkedin_secret_names   = distinct(values({ for k, v in var.linkedin_secret_env_vars : k => v.secret_name }))
  tiktok_secret_names     = distinct(values({ for k, v in var.tiktok_secret_env_vars : k => v.secret_name }))
  cm360_secret_names      = distinct(values({ for k, v in var.cm360_secret_env_vars : k => v.secret_name }))
  sa360_secret_names      = distinct(values({ for k, v in var.sa360_secret_env_vars : k => v.secret_name }))
  pinterest_secret_names  = distinct(values({ for k, v in var.pinterest_secret_env_vars : k => v.secret_name }))
  snapchat_secret_names   = distinct(values({ for k, v in var.snapchat_secret_env_vars : k => v.secret_name }))
  amazon_dsp_secret_names = distinct(values({ for k, v in var.amazon_dsp_secret_env_vars : k => v.secret_name }))
  msads_secret_names      = distinct(values({ for k, v in var.msads_secret_env_vars : k => v.secret_name }))
}

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

  dbm_resources        = merge(local.service_defaults, { for k, v in lookup(var.service_resource_overrides, "dbm-mcp", local.empty_service_override) : k => v if v != null })
  dv360_resources      = merge(local.service_defaults, { for k, v in lookup(var.service_resource_overrides, "dv360-mcp", local.empty_service_override) : k => v if v != null })
  ttd_resources        = merge(local.service_defaults, { for k, v in lookup(var.service_resource_overrides, "ttd-mcp", local.empty_service_override) : k => v if v != null })
  gads_resources       = merge(local.service_defaults, { for k, v in lookup(var.service_resource_overrides, "gads-mcp", local.empty_service_override) : k => v if v != null })
  meta_resources       = merge(local.service_defaults, { for k, v in lookup(var.service_resource_overrides, "meta-mcp", local.empty_service_override) : k => v if v != null })
  linkedin_resources   = merge(local.service_defaults, { for k, v in lookup(var.service_resource_overrides, "linkedin-mcp", local.empty_service_override) : k => v if v != null })
  tiktok_resources     = merge(local.service_defaults, { for k, v in lookup(var.service_resource_overrides, "tiktok-mcp", local.empty_service_override) : k => v if v != null })
  cm360_resources      = merge(local.service_defaults, { for k, v in lookup(var.service_resource_overrides, "cm360-mcp", local.empty_service_override) : k => v if v != null })
  sa360_resources      = merge(local.service_defaults, { for k, v in lookup(var.service_resource_overrides, "sa360-mcp", local.empty_service_override) : k => v if v != null })
  pinterest_resources  = merge(local.service_defaults, { for k, v in lookup(var.service_resource_overrides, "pinterest-mcp", local.empty_service_override) : k => v if v != null })
  snapchat_resources   = merge(local.service_defaults, { for k, v in lookup(var.service_resource_overrides, "snapchat-mcp", local.empty_service_override) : k => v if v != null })
  amazon_dsp_resources = merge(local.service_defaults, { for k, v in lookup(var.service_resource_overrides, "amazon-dsp-mcp", local.empty_service_override) : k => v if v != null })
  msads_resources      = merge(local.service_defaults, { for k, v in lookup(var.service_resource_overrides, "msads-mcp", local.empty_service_override) : k => v if v != null })
}

locals {
  service_auth_defaults = {
    "dbm-mcp"        = "google-headers"
    "dv360-mcp"      = "google-headers"
    "ttd-mcp"        = "ttd-headers"
    "gads-mcp"       = "gads-headers"
    "meta-mcp"       = "meta-bearer"
    "linkedin-mcp"   = "linkedin-bearer"
    "tiktok-mcp"     = "tiktok-bearer"
    "cm360-mcp"      = "google-headers"
    "sa360-mcp"      = "sa360-headers"
    "pinterest-mcp"  = "pinterest-bearer"
    "snapchat-mcp"   = "snapchat-bearer"
    "amazon-dsp-mcp" = "amazon-dsp-bearer"
    "msads-mcp"      = "msads-bearer"
  }

  dbm_auth_mode        = lookup(var.service_auth_mode_overrides, "dbm-mcp", local.service_auth_defaults["dbm-mcp"])
  dv360_auth_mode      = lookup(var.service_auth_mode_overrides, "dv360-mcp", local.service_auth_defaults["dv360-mcp"])
  ttd_auth_mode        = lookup(var.service_auth_mode_overrides, "ttd-mcp", local.service_auth_defaults["ttd-mcp"])
  gads_auth_mode       = lookup(var.service_auth_mode_overrides, "gads-mcp", local.service_auth_defaults["gads-mcp"])
  meta_auth_mode       = lookup(var.service_auth_mode_overrides, "meta-mcp", local.service_auth_defaults["meta-mcp"])
  linkedin_auth_mode   = lookup(var.service_auth_mode_overrides, "linkedin-mcp", local.service_auth_defaults["linkedin-mcp"])
  tiktok_auth_mode     = lookup(var.service_auth_mode_overrides, "tiktok-mcp", local.service_auth_defaults["tiktok-mcp"])
  cm360_auth_mode      = lookup(var.service_auth_mode_overrides, "cm360-mcp", local.service_auth_defaults["cm360-mcp"])
  sa360_auth_mode      = lookup(var.service_auth_mode_overrides, "sa360-mcp", local.service_auth_defaults["sa360-mcp"])
  pinterest_auth_mode  = lookup(var.service_auth_mode_overrides, "pinterest-mcp", local.service_auth_defaults["pinterest-mcp"])
  snapchat_auth_mode   = lookup(var.service_auth_mode_overrides, "snapchat-mcp", local.service_auth_defaults["snapchat-mcp"])
  amazon_dsp_auth_mode = lookup(var.service_auth_mode_overrides, "amazon-dsp-mcp", local.service_auth_defaults["amazon-dsp-mcp"])
  msads_auth_mode      = lookup(var.service_auth_mode_overrides, "msads-mcp", local.service_auth_defaults["msads-mcp"])
}

module "dbm_mcp" {
  source = "./modules/mcp-service"

  service_name           = "dbm-mcp"
  container_image        = var.dbm_mcp_image
  project_id             = var.project_id
  region                 = var.region
  environment            = var.environment
  min_instances          = local.dbm_resources.min_instances
  max_instances          = local.dbm_resources.max_instances
  cpu_limit              = local.dbm_resources.cpu_limit
  memory_limit           = local.dbm_resources.memory_limit
  cpu_always_allocated   = var.cpu_always_allocated
  allow_unauthenticated  = var.allow_unauthenticated
  authorized_invokers    = var.authorized_invokers
  vpc_connector_name     = module.networking.vpc_connector_id
  mcp_session_mode       = var.mcp_session_mode
  mcp_auth_mode          = local.dbm_auth_mode
  log_level              = var.log_level
  enable_gcs_persistence = var.enable_gcs_persistence
  gcs_bucket_name        = var.gcs_bucket_name
  secret_names           = local.dbm_secret_names
  secret_env_vars        = var.dbm_secret_env_vars

  depends_on = [module.networking, google_storage_bucket.gcs_persistence]
}

module "dv360_mcp" {
  source = "./modules/mcp-service"

  service_name           = "dv360-mcp"
  container_image        = var.dv360_mcp_image
  project_id             = var.project_id
  region                 = var.region
  environment            = var.environment
  min_instances          = local.dv360_resources.min_instances
  max_instances          = local.dv360_resources.max_instances
  cpu_limit              = local.dv360_resources.cpu_limit
  memory_limit           = local.dv360_resources.memory_limit
  cpu_always_allocated   = var.cpu_always_allocated
  allow_unauthenticated  = var.allow_unauthenticated
  authorized_invokers    = var.authorized_invokers
  vpc_connector_name     = module.networking.vpc_connector_id
  mcp_session_mode       = var.mcp_session_mode
  mcp_auth_mode          = local.dv360_auth_mode
  log_level              = var.log_level
  enable_gcs_persistence = var.enable_gcs_persistence
  gcs_bucket_name        = var.gcs_bucket_name
  secret_names           = local.dv360_secret_names
  secret_env_vars        = var.dv360_secret_env_vars

  depends_on = [module.networking, google_storage_bucket.gcs_persistence]
}

module "ttd_mcp" {
  source = "./modules/mcp-service"

  service_name           = "ttd-mcp"
  container_image        = var.ttd_mcp_image
  project_id             = var.project_id
  region                 = var.region
  environment            = var.environment
  min_instances          = local.ttd_resources.min_instances
  max_instances          = local.ttd_resources.max_instances
  cpu_limit              = local.ttd_resources.cpu_limit
  memory_limit           = local.ttd_resources.memory_limit
  cpu_always_allocated   = var.cpu_always_allocated
  allow_unauthenticated  = var.allow_unauthenticated
  authorized_invokers    = var.authorized_invokers
  vpc_connector_name     = module.networking.vpc_connector_id
  mcp_session_mode       = var.mcp_session_mode
  mcp_auth_mode          = local.ttd_auth_mode
  log_level              = var.log_level
  enable_gcs_persistence = var.enable_gcs_persistence
  gcs_bucket_name        = var.gcs_bucket_name
  secret_names           = local.ttd_secret_names
  secret_env_vars        = var.ttd_secret_env_vars

  depends_on = [module.networking, google_storage_bucket.gcs_persistence]
}

module "gads_mcp" {
  source = "./modules/mcp-service"

  service_name           = "gads-mcp"
  container_image        = var.gads_mcp_image
  project_id             = var.project_id
  region                 = var.region
  environment            = var.environment
  min_instances          = local.gads_resources.min_instances
  max_instances          = local.gads_resources.max_instances
  cpu_limit              = local.gads_resources.cpu_limit
  memory_limit           = local.gads_resources.memory_limit
  cpu_always_allocated   = var.cpu_always_allocated
  allow_unauthenticated  = var.allow_unauthenticated
  authorized_invokers    = var.authorized_invokers
  vpc_connector_name     = module.networking.vpc_connector_id
  mcp_session_mode       = var.mcp_session_mode
  mcp_auth_mode          = local.gads_auth_mode
  log_level              = var.log_level
  enable_gcs_persistence = var.enable_gcs_persistence
  gcs_bucket_name        = var.gcs_bucket_name
  secret_names           = local.gads_secret_names
  secret_env_vars        = var.gads_secret_env_vars

  depends_on = [module.networking, google_storage_bucket.gcs_persistence]
}

module "meta_mcp" {
  source = "./modules/mcp-service"

  service_name           = "meta-mcp"
  container_image        = var.meta_mcp_image
  project_id             = var.project_id
  region                 = var.region
  environment            = var.environment
  min_instances          = local.meta_resources.min_instances
  max_instances          = local.meta_resources.max_instances
  cpu_limit              = local.meta_resources.cpu_limit
  memory_limit           = local.meta_resources.memory_limit
  cpu_always_allocated   = var.cpu_always_allocated
  allow_unauthenticated  = var.allow_unauthenticated
  authorized_invokers    = var.authorized_invokers
  vpc_connector_name     = module.networking.vpc_connector_id
  mcp_session_mode       = var.mcp_session_mode
  mcp_auth_mode          = local.meta_auth_mode
  log_level              = var.log_level
  enable_gcs_persistence = var.enable_gcs_persistence
  gcs_bucket_name        = var.gcs_bucket_name
  secret_names           = local.meta_secret_names
  secret_env_vars        = var.meta_secret_env_vars

  depends_on = [module.networking, google_storage_bucket.gcs_persistence]
}

module "linkedin_mcp" {
  source = "./modules/mcp-service"

  service_name           = "linkedin-mcp"
  container_image        = var.linkedin_mcp_image
  project_id             = var.project_id
  region                 = var.region
  environment            = var.environment
  min_instances          = local.linkedin_resources.min_instances
  max_instances          = local.linkedin_resources.max_instances
  cpu_limit              = local.linkedin_resources.cpu_limit
  memory_limit           = local.linkedin_resources.memory_limit
  cpu_always_allocated   = var.cpu_always_allocated
  allow_unauthenticated  = var.allow_unauthenticated
  authorized_invokers    = var.authorized_invokers
  vpc_connector_name     = module.networking.vpc_connector_id
  mcp_session_mode       = var.mcp_session_mode
  mcp_auth_mode          = local.linkedin_auth_mode
  log_level              = var.log_level
  enable_gcs_persistence = var.enable_gcs_persistence
  gcs_bucket_name        = var.gcs_bucket_name
  secret_names           = local.linkedin_secret_names
  secret_env_vars        = var.linkedin_secret_env_vars

  depends_on = [module.networking, google_storage_bucket.gcs_persistence]
}

module "tiktok_mcp" {
  source = "./modules/mcp-service"

  service_name           = "tiktok-mcp"
  container_image        = var.tiktok_mcp_image
  project_id             = var.project_id
  region                 = var.region
  environment            = var.environment
  min_instances          = local.tiktok_resources.min_instances
  max_instances          = local.tiktok_resources.max_instances
  cpu_limit              = local.tiktok_resources.cpu_limit
  memory_limit           = local.tiktok_resources.memory_limit
  cpu_always_allocated   = var.cpu_always_allocated
  allow_unauthenticated  = var.allow_unauthenticated
  authorized_invokers    = var.authorized_invokers
  vpc_connector_name     = module.networking.vpc_connector_id
  mcp_session_mode       = var.mcp_session_mode
  mcp_auth_mode          = local.tiktok_auth_mode
  log_level              = var.log_level
  enable_gcs_persistence = var.enable_gcs_persistence
  gcs_bucket_name        = var.gcs_bucket_name
  secret_names           = local.tiktok_secret_names
  secret_env_vars        = var.tiktok_secret_env_vars

  depends_on = [module.networking, google_storage_bucket.gcs_persistence]
}

module "cm360_mcp" {
  source = "./modules/mcp-service"

  service_name           = "cm360-mcp"
  container_image        = var.cm360_mcp_image
  project_id             = var.project_id
  region                 = var.region
  environment            = var.environment
  min_instances          = local.cm360_resources.min_instances
  max_instances          = local.cm360_resources.max_instances
  cpu_limit              = local.cm360_resources.cpu_limit
  memory_limit           = local.cm360_resources.memory_limit
  cpu_always_allocated   = var.cpu_always_allocated
  allow_unauthenticated  = var.allow_unauthenticated
  authorized_invokers    = var.authorized_invokers
  vpc_connector_name     = module.networking.vpc_connector_id
  mcp_session_mode       = var.mcp_session_mode
  mcp_auth_mode          = local.cm360_auth_mode
  log_level              = var.log_level
  enable_gcs_persistence = var.enable_gcs_persistence
  gcs_bucket_name        = var.gcs_bucket_name
  secret_names           = local.cm360_secret_names
  secret_env_vars        = var.cm360_secret_env_vars

  depends_on = [module.networking, google_storage_bucket.gcs_persistence]
}

module "sa360_mcp" {
  source = "./modules/mcp-service"

  service_name           = "sa360-mcp"
  container_image        = var.sa360_mcp_image
  project_id             = var.project_id
  region                 = var.region
  environment            = var.environment
  min_instances          = local.sa360_resources.min_instances
  max_instances          = local.sa360_resources.max_instances
  cpu_limit              = local.sa360_resources.cpu_limit
  memory_limit           = local.sa360_resources.memory_limit
  cpu_always_allocated   = var.cpu_always_allocated
  allow_unauthenticated  = var.allow_unauthenticated
  authorized_invokers    = var.authorized_invokers
  vpc_connector_name     = module.networking.vpc_connector_id
  mcp_session_mode       = var.mcp_session_mode
  mcp_auth_mode          = local.sa360_auth_mode
  log_level              = var.log_level
  enable_gcs_persistence = var.enable_gcs_persistence
  gcs_bucket_name        = var.gcs_bucket_name
  secret_names           = local.sa360_secret_names
  secret_env_vars        = var.sa360_secret_env_vars

  depends_on = [module.networking, google_storage_bucket.gcs_persistence]
}

module "pinterest_mcp" {
  source = "./modules/mcp-service"

  service_name           = "pinterest-mcp"
  container_image        = var.pinterest_mcp_image
  project_id             = var.project_id
  region                 = var.region
  environment            = var.environment
  min_instances          = local.pinterest_resources.min_instances
  max_instances          = local.pinterest_resources.max_instances
  cpu_limit              = local.pinterest_resources.cpu_limit
  memory_limit           = local.pinterest_resources.memory_limit
  cpu_always_allocated   = var.cpu_always_allocated
  allow_unauthenticated  = var.allow_unauthenticated
  authorized_invokers    = var.authorized_invokers
  vpc_connector_name     = module.networking.vpc_connector_id
  mcp_session_mode       = var.mcp_session_mode
  mcp_auth_mode          = local.pinterest_auth_mode
  log_level              = var.log_level
  enable_gcs_persistence = var.enable_gcs_persistence
  gcs_bucket_name        = var.gcs_bucket_name
  secret_names           = local.pinterest_secret_names
  secret_env_vars        = var.pinterest_secret_env_vars

  depends_on = [module.networking, google_storage_bucket.gcs_persistence]
}

module "snapchat_mcp" {
  source = "./modules/mcp-service"

  service_name           = "snapchat-mcp"
  container_image        = var.snapchat_mcp_image
  project_id             = var.project_id
  region                 = var.region
  environment            = var.environment
  min_instances          = local.snapchat_resources.min_instances
  max_instances          = local.snapchat_resources.max_instances
  cpu_limit              = local.snapchat_resources.cpu_limit
  memory_limit           = local.snapchat_resources.memory_limit
  cpu_always_allocated   = var.cpu_always_allocated
  allow_unauthenticated  = var.allow_unauthenticated
  authorized_invokers    = var.authorized_invokers
  vpc_connector_name     = module.networking.vpc_connector_id
  mcp_session_mode       = var.mcp_session_mode
  mcp_auth_mode          = local.snapchat_auth_mode
  log_level              = var.log_level
  enable_gcs_persistence = var.enable_gcs_persistence
  gcs_bucket_name        = var.gcs_bucket_name
  secret_names           = local.snapchat_secret_names
  secret_env_vars        = var.snapchat_secret_env_vars

  depends_on = [module.networking, google_storage_bucket.gcs_persistence]
}

module "amazon_dsp_mcp" {
  source = "./modules/mcp-service"

  service_name           = "amazon-dsp-mcp"
  container_image        = var.amazon_dsp_mcp_image
  project_id             = var.project_id
  region                 = var.region
  environment            = var.environment
  min_instances          = local.amazon_dsp_resources.min_instances
  max_instances          = local.amazon_dsp_resources.max_instances
  cpu_limit              = local.amazon_dsp_resources.cpu_limit
  memory_limit           = local.amazon_dsp_resources.memory_limit
  cpu_always_allocated   = var.cpu_always_allocated
  allow_unauthenticated  = var.allow_unauthenticated
  authorized_invokers    = var.authorized_invokers
  vpc_connector_name     = module.networking.vpc_connector_id
  mcp_session_mode       = var.mcp_session_mode
  mcp_auth_mode          = local.amazon_dsp_auth_mode
  log_level              = var.log_level
  enable_gcs_persistence = var.enable_gcs_persistence
  gcs_bucket_name        = var.gcs_bucket_name
  secret_names           = local.amazon_dsp_secret_names
  secret_env_vars        = var.amazon_dsp_secret_env_vars

  depends_on = [module.networking, google_storage_bucket.gcs_persistence]
}

module "msads_mcp" {
  source = "./modules/mcp-service"

  service_name           = "msads-mcp"
  container_image        = var.msads_mcp_image
  project_id             = var.project_id
  region                 = var.region
  environment            = var.environment
  min_instances          = local.msads_resources.min_instances
  max_instances          = local.msads_resources.max_instances
  cpu_limit              = local.msads_resources.cpu_limit
  memory_limit           = local.msads_resources.memory_limit
  cpu_always_allocated   = var.cpu_always_allocated
  allow_unauthenticated  = var.allow_unauthenticated
  authorized_invokers    = var.authorized_invokers
  vpc_connector_name     = module.networking.vpc_connector_id
  mcp_session_mode       = var.mcp_session_mode
  mcp_auth_mode          = local.msads_auth_mode
  log_level              = var.log_level
  enable_gcs_persistence = var.enable_gcs_persistence
  gcs_bucket_name        = var.gcs_bucket_name
  secret_names           = local.msads_secret_names
  secret_env_vars        = var.msads_secret_env_vars

  depends_on = [module.networking, google_storage_bucket.gcs_persistence]
}

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
    { name = "cm360-mcp", url = module.cm360_mcp.cloud_run_service_url },
    { name = "sa360-mcp", url = module.sa360_mcp.cloud_run_service_url },
    { name = "pinterest-mcp", url = module.pinterest_mcp.cloud_run_service_url },
    { name = "snapchat-mcp", url = module.snapchat_mcp.cloud_run_service_url },
    { name = "amazon-dsp-mcp", url = module.amazon_dsp_mcp.cloud_run_service_url },
    { name = "msads-mcp", url = module.msads_mcp.cloud_run_service_url },
  ]

  notification_channels    = var.monitoring_notification_channels
  notification_email       = var.monitoring_notification_email
  error_rate_threshold     = var.monitoring_error_rate_threshold
  latency_p99_threshold_ms = var.monitoring_latency_p99_threshold_ms
  uptime_check_period      = var.monitoring_uptime_check_period
}

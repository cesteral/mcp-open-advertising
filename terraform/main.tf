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

# Service APIs the stack depends on. Mirrors scripts/init-gcp-project.sh's
# runtime subset so a fresh project can be applied without running the init
# script's enable loop first (the init script remains the bootstrap for the
# state bucket, deployer SA, and build-time APIs). serviceusage.googleapis.com
# and cloudresourcemanager.googleapis.com themselves cannot be self-enabled
# here — they must already be on for terraform to talk to the project at all.
locals {
  base_required_apis = [
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "artifactregistry.googleapis.com",
    "compute.googleapis.com",
    "vpcaccess.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com",
    "cloudtrace.googleapis.com",
    "storage-api.googleapis.com",
    "iam.googleapis.com",
  ]

  # Firestore backs the governance jti store and is enabled only when that store
  # is provisioned — it is not needed by the fleet otherwise. Conditional rather
  # than unconditional so a deployment that never runs `enforce` does not carry
  # an API (and its default database) it has no use for.
  # Workload Identity Federation for the scheduled drift check needs the STS
  # token-exchange endpoint and the SA-impersonation API. Conditional for the
  # same reason as firestore: a deployment that never federates should not carry
  # them. Without sts.googleapis.com the pool and provider apply cleanly and
  # then every token exchange fails at run time — a bootstrap that looks
  # complete but is not.
  required_apis = concat(
    local.base_required_apis,
    var.enable_governance_jti_store ? ["firestore.googleapis.com"] : [],
    var.enable_drift_check_reader ? ["sts.googleapis.com", "iamcredentials.googleapis.com"] : []
  )
}

resource "google_project_service" "required" {
  for_each = var.enable_required_apis ? toset(local.required_apis) : toset([])

  project = var.project_id
  service = each.value

  # Never disable a shared API on stack destroy — other infrastructure in the
  # project may rely on it.
  disable_on_destroy = false
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

  # Interaction logs hold tool-call parameters and upstream error bodies, which
  # can include free text supplied by end users, so they are treated as personal
  # data. Expiry is the erasure mechanism: 28 days keeps passive deletion inside
  # the one-month limit of GDPR Art. 12(3) even with about a day of lifecycle
  # lag (issue cesteral/cesteral-governance-layer#855).
  lifecycle_rule {
    condition { age = 28 }
    action { type = "Delete" }
  }
}

# Report-CSV spill bucket. Populated by the shared spillCsvToGcs helper
# whenever REPORT_SPILL_BUCKET is set and a downloaded report exceeds the
# byte/row threshold. Objects are expected to be ephemeral — the
# 1-day lifecycle rule is the primary cost control; per-session cleanup
# hooks (packages/shared/src/utils/reporting/report-spill.ts#deleteSpilledObjectsForSession)
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

# ---------------------------------------------------------------------------
# Governance decision-token replay protection (jti store)
# ---------------------------------------------------------------------------
# Backing store for `FirestoreJtiStore` (packages/shared/src/governance/jti-store.ts).
#
# Why Firestore and not a bucket or memory (issue #167, sibling of #166): the
# consume-once guarantee has to hold ACROSS Cloud Run instances. `doc(jti).create()`
# is an atomic create-if-absent, so a replayed decision token routed to a second
# instance rejects with ALREADY_EXISTS instead of being accepted as fresh and
# double-executing a money-moving write. An in-memory store only blocks replays
# that happen to land on the same instance.
#
# Enable together with GOVERNANCE_JTI_STORE=firestore on the service revisions; the
# server refuses to boot under `enforce` if the env declares firestore and the
# distributed store is not actually reachable.
resource "google_firestore_database" "governance" {
  count = var.enable_governance_jti_store ? 1 : 0

  project     = var.project_id
  name        = var.governance_jti_database_name
  location_id = var.governance_jti_location
  type        = "FIRESTORE_NATIVE"

  # The jti collection is pure replay-protection bookkeeping — every document is
  # reconstructible-by-absence and expires within minutes. Point-in-time recovery
  # would bill for retention of data whose whole purpose is to be forgotten.
  point_in_time_recovery_enablement = "POINT_IN_TIME_RECOVERY_DISABLED"
  delete_protection_state           = var.environment == "prod" ? "DELETE_PROTECTION_ENABLED" : "DELETE_PROTECTION_DISABLED"

  # `firestore.googleapis.com` is only in `required_apis` when this feature is
  # enabled, and API enablement is not implicit in the resource graph. Without
  # this edge, `terraform apply` races the enablement and fails with "Cloud
  # Firestore API has not been used in project ... before or it is disabled" —
  # which `terraform plan` cannot surface, because plan does not check API state.
  # Verified against open-agentic-advertising-dev, where the API is currently off.
  depends_on = [google_project_service.required]
}

# TTL policy — the storage-cost control, NOT the correctness mechanism.
# Correctness is the atomic create above; this only reclaims consumed entries.
#
# It must target a Timestamp-typed field: Firestore TTL policies ignore fields of
# any other type, silently. `FirestoreJtiStore` writes `expiresAt` as a `Date`
# (stored as a Timestamp) precisely so this policy can act on it — it previously
# wrote an ISO string, which would have left this collection growing forever with
# a policy that appeared to be configured correctly.
resource "google_firestore_field" "governance_jti_ttl" {
  count = var.enable_governance_jti_store ? 1 : 0

  project    = var.project_id
  database   = google_firestore_database.governance[0].name
  collection = var.governance_jti_collection
  field      = "expiresAt"

  ttl_config {}

  # Leave indexing untouched: this field is only read by the TTL sweeper, never
  # queried, so the default single-field indexes are unnecessary write cost.
  index_config {}
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

# ── MCP services ─────────────────────────────────────────────────────────────
# One Cloud Run service per server in registry.json, so registering a server
# there adds it here. Each service's inputs are computed once in
# local.mcp_service_inputs; the expressions are the ones the per-server module
# blocks used before the move to for_each (see moved.tf).

locals {
  fleet_service_names = [for s in jsondecode(file("${path.module}/../registry.json")).servers : s.package]

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

  # Default MCP_AUTH_MODE per service; must be one of the server's registry
  # auth.modes (scripts/lib/fleet-inventory.test.mjs checks it).
  service_auth_defaults = {
    "dbm-mcp"        = "google-headers"
    "dv360-mcp"      = "google-headers"
    "ttd-mcp"        = "ttd-token"
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

  mcp_service_inputs = {
    for name in local.fleet_service_names : name => {
      image           = var.mcp_images[name]
      secret_env_vars = var.mcp_secret_env_vars[name]
      secret_names    = distinct(values({ for k, v in var.mcp_secret_env_vars[name] : k => v.secret_name }))
      resources       = merge(local.service_defaults, { for k, v in lookup(var.service_resource_overrides, name, local.empty_service_override) : k => v if v != null })
      auth_mode       = lookup(var.service_auth_mode_overrides, name, local.service_auth_defaults[name])
    }
  }
}

module "mcp_service" {
  for_each = local.mcp_service_inputs

  source = "./modules/mcp-service"

  service_name                          = each.key
  container_image                       = each.value.image
  project_id                            = var.project_id
  region                                = var.region
  environment                           = var.environment
  min_instances                         = each.value.resources.min_instances
  max_instances                         = each.value.resources.max_instances
  cpu_limit                             = each.value.resources.cpu_limit
  memory_limit                          = each.value.resources.memory_limit
  cpu_always_allocated                  = var.cpu_always_allocated
  allow_unauthenticated                 = var.allow_unauthenticated
  authorized_invokers                   = var.authorized_invokers
  vpc_connector_name                    = module.networking.vpc_connector_id
  mcp_auth_mode                         = each.value.auth_mode
  log_level                             = var.log_level
  governance_token_mode                 = var.governance_token_mode
  governance_token_secret_name          = var.governance_token_secret_name
  governance_token_secret_previous_name = var.governance_token_secret_previous_name
  governance_token_enforce_contracts    = var.governance_token_enforce_contracts
  enable_gcs_persistence                = var.enable_gcs_persistence
  gcs_bucket_name                       = var.gcs_bucket_name
  secret_names                          = each.value.secret_names
  secret_env_vars                       = each.value.secret_env_vars
  custom_audiences                      = local.fleet_custom_audiences

  depends_on = [module.networking, google_storage_bucket.gcs_persistence, google_project_service.required]
}

module "monitoring" {
  source = "./modules/monitoring"

  project_id  = var.project_id
  region      = var.region
  environment = var.environment

  services = [for name in local.fleet_service_names : { name = name, url = module.mcp_service[name].cloud_run_service_url }]

  notification_channels    = var.monitoring_notification_channels
  notification_email       = var.monitoring_notification_email
  error_rate_threshold     = var.monitoring_error_rate_threshold
  latency_p99_threshold_ms = var.monitoring_latency_p99_threshold_ms
  uptime_check_period      = var.monitoring_uptime_check_period

  # Probe the caller-facing path too, not just each service's own Cloud Run URL.
  # Empty when the shared LB is disabled, which drops those checks entirely.
  fleet_domain = var.enable_fleet_lb ? var.fleet_domain : ""

  # An uptime checker is anonymous, so it sees the auth posture rather than
  # `/health`. Under the normal locked posture that is a 403, and asserting 200
  # would fail permanently while testing the wrong property.
  expected_health_status = var.allow_unauthenticated ? 200 : 403
}

# ── Fleet load balancer (custom domain) ──────────────────────────────────────
# Serves every MCP server under one host: https://<fleet_domain>/<platform>/mcp.
# The per-service path prefix is the service name minus the "-mcp" suffix,
# matching the platform slugs the cesteral-intelligence connection templates
# already use. Tokens minted for https://<fleet_domain> are accepted by every
# service via custom_audiences (local.fleet_custom_audiences, wired into every
# mcp-service module call).

locals {
  fleet_services = {
    for name in local.fleet_service_names : name => {
      path_prefix = trimsuffix(name, "-mcp")
    }
  }

  fleet_custom_audiences = var.enable_fleet_lb ? ["https://${var.fleet_domain}"] : []
}

module "fleet_lb" {
  source = "./modules/fleet-lb"
  count  = var.enable_fleet_lb ? 1 : 0

  project_id    = var.project_id
  region        = var.region
  environment   = var.environment
  domain        = var.fleet_domain
  services      = local.fleet_services
  redirect_host = var.fleet_redirect_host

  depends_on = [
    module.mcp_service,
    google_project_service.required,
  ]
}

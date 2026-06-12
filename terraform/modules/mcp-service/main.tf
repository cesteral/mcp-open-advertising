# MCP Service Module for Cesteral
# Parameterized module: instantiated once per MCP server (dbm-mcp, dv360-mcp, ttd-mcp)
# Includes: Cloud Run service, Secret Manager, IAM

locals {
  common_labels = {
    application = "cesteral"
    service     = var.service_name
    environment = var.environment
    managed_by  = "terraform"
  }
}

# ============================================================================
# SERVICE ACCOUNTS
# ============================================================================

# Runtime service account for Cloud Run
resource "google_service_account" "runtime" {
  account_id   = "${var.service_name}-runtime"
  display_name = "Cesteral ${var.service_name} Runtime Service Account"
  description  = "Service account for ${var.service_name} runtime"
  project      = var.project_id

  lifecycle {
    prevent_destroy = true
  }
}

# Grant runtime service account access to secrets
resource "google_secret_manager_secret_iam_member" "runtime_secret_accessor" {
  for_each  = toset(var.secret_names)
  project   = var.project_id
  secret_id = google_secret_manager_secret.secrets[each.value].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime.email}"
}

# Access to the shared governance decision-token secret(s). Unlike
# secret_names entries these are NOT created here: one secret is shared by
# every service in the fleet (and by the governance layer's mint side), so no
# single service module can own it. The data source fails the plan early if
# the operator has not provisioned the secret container.
data "google_secret_manager_secret" "governance_token_secret" {
  count     = var.governance_token_secret_name != "" ? 1 : 0
  project   = var.project_id
  secret_id = var.governance_token_secret_name
}

data "google_secret_manager_secret" "governance_token_secret_previous" {
  count     = var.governance_token_secret_previous_name != "" ? 1 : 0
  project   = var.project_id
  secret_id = var.governance_token_secret_previous_name
}

resource "google_secret_manager_secret_iam_member" "governance_token_secret_accessor" {
  count     = var.governance_token_secret_name != "" ? 1 : 0
  project   = var.project_id
  secret_id = data.google_secret_manager_secret.governance_token_secret[0].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_secret_manager_secret_iam_member" "governance_token_secret_previous_accessor" {
  count     = var.governance_token_secret_previous_name != "" ? 1 : 0
  project   = var.project_id
  secret_id = data.google_secret_manager_secret.governance_token_secret_previous[0].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime.email}"
}

# Grant runtime service account logging permissions
resource "google_project_iam_member" "runtime_log_writer" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.runtime.email}"
}

# Grant runtime service account monitoring permissions
resource "google_project_iam_member" "runtime_monitoring_writer" {
  project = var.project_id
  role    = "roles/monitoring.metricWriter"
  member  = "serviceAccount:${google_service_account.runtime.email}"
}

# Grant runtime service account Cloud Trace permissions
resource "google_project_iam_member" "runtime_trace_agent" {
  project = var.project_id
  role    = "roles/cloudtrace.agent"
  member  = "serviceAccount:${google_service_account.runtime.email}"
}

# ============================================================================
# GCS PERSISTENCE (learnings, findings, interaction logs)
# ============================================================================

resource "google_storage_bucket_iam_member" "runtime_storage_user" {
  count  = var.enable_gcs_persistence ? 1 : 0
  bucket = var.gcs_bucket_name
  role   = "roles/storage.objectUser"
  member = "serviceAccount:${google_service_account.runtime.email}"
}

# ============================================================================
# SECRET MANAGER
# ============================================================================

# Define secrets to be created
resource "google_secret_manager_secret" "secrets" {
  for_each = toset(var.secret_names)

  project   = var.project_id
  secret_id = each.value

  labels = local.common_labels

  replication {
    auto {}
  }

  lifecycle {
    prevent_destroy = true
  }
}

# Note: Secret versions must be created manually or via scripts
# Terraform should not manage secret values directly for security

# ============================================================================
# CLOUD RUN SERVICE
# ============================================================================

resource "google_cloud_run_v2_service" "mcp_server" {
  name     = var.service_name
  location = var.region
  project  = var.project_id

  labels = local.common_labels

  # Extra audiences accepted on incoming ID tokens (besides the run.app URL),
  # so invokers behind the fleet load balancer can mint one token for the
  # custom domain instead of one per service.
  custom_audiences = length(var.custom_audiences) > 0 ? var.custom_audiences : null

  template {
    service_account = google_service_account.runtime.email

    # VPC connector for private networking (if provided)
    dynamic "vpc_access" {
      for_each = var.vpc_connector_name != "" ? [1] : []
      content {
        connector = var.vpc_connector_name
        egress    = "ALL_TRAFFIC"
      }
    }

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    containers {
      image = var.container_image

      ports {
        container_port = var.container_port
        name           = "http1"
      }

      # Resource limits
      resources {
        limits = {
          cpu    = var.cpu_limit
          memory = var.memory_limit
        }
        cpu_idle = !var.cpu_always_allocated
      }

      # Startup probe
      startup_probe {
        http_get {
          path = "/health"
          port = var.container_port
        }
        initial_delay_seconds = 10
        timeout_seconds       = 3
        period_seconds        = 10
        failure_threshold     = 3
      }

      # Liveness probe
      liveness_probe {
        http_get {
          path = "/health"
          port = var.container_port
        }
        initial_delay_seconds = 30
        timeout_seconds       = 3
        period_seconds        = 30
        failure_threshold     = 3
      }

      # Environment variables - MCP server configuration.
      # Name MUST be MCP_TRANSPORT_MODE — that's what detectTransportMode() reads
      # (server-bootstrap.ts). With the wrong name the var is inert and the
      # container, having no TTY on Cloud Run, falls back to stdio → nothing
      # listens on the port → health checks fail.
      env {
        name  = "MCP_TRANSPORT_MODE"
        value = "http"
      }

      env {
        name  = "MCP_HTTP_PORT"
        value = tostring(var.container_port)
      }

      env {
        name  = "MCP_HTTP_HOST"
        value = "0.0.0.0"
      }

      env {
        name  = "MCP_AUTH_MODE"
        value = var.mcp_auth_mode
      }

      env {
        name  = "NODE_ENV"
        value = var.environment == "prod" ? "production" : "development"
      }

      env {
        name  = "LOG_LEVEL"
        value = var.log_level
      }

      env {
        name  = "OTEL_ENABLED"
        value = "true"
      }

      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }

      # Secret environment variables
      dynamic "env" {
        for_each = var.secret_env_vars
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.secrets[env.value.secret_name].secret_id
              version = env.value.version
            }
          }
        }
      }

      # GCS persistence (optional)
      dynamic "env" {
        for_each = var.enable_gcs_persistence ? [1] : []
        content {
          name  = "GCS_BUCKET_NAME"
          value = var.gcs_bucket_name
        }
      }

      # InteractionLogger destination override (optional).
      # file | gcs | stdout — see packages/shared/src/utils/interaction-logger.ts
      dynamic "env" {
        for_each = length(var.interaction_log_mode) > 0 ? [1] : []
        content {
          name  = "INTERACTION_LOG_MODE"
          value = var.interaction_log_mode
        }
      }

      # Governance decision-token enforcement mode (optional).
      # off | warn | enforce — resolved per-contract by resolveTokenMode()
      # in packages/shared/src/governance/config.ts. Empty leaves it unset so
      # the server uses its 'off' code default. The shared signing secret
      # (GOVERNANCE_DECISION_TOKEN_SECRET[_PREVIOUS]) is wired below via the
      # governance_token_secret_name variables — see
      # docs/governance/decision-token-rollout-and-rotation.md.
      dynamic "env" {
        for_each = length(var.governance_token_mode) > 0 ? [1] : []
        content {
          name  = "GOVERNANCE_TOKEN_MODE"
          value = var.governance_token_mode
        }
      }

      # Per-contract enforce staging — highest precedence in resolveTokenMode(),
      # so proven contracts can be enforced while the fleet mode stays 'warn'.
      dynamic "env" {
        for_each = length(var.governance_token_enforce_contracts) > 0 ? [1] : []
        content {
          name  = "GOVERNANCE_TOKEN_MODE_ENFORCE_CONTRACTS"
          value = join(",", var.governance_token_enforce_contracts)
        }
      }

      # Shared decision-token signing secret (verify side). Sourced from the
      # operator-provisioned shared secret, not a module-created one.
      dynamic "env" {
        for_each = var.governance_token_secret_name != "" ? [1] : []
        content {
          name = "GOVERNANCE_DECISION_TOKEN_SECRET"
          value_source {
            secret_key_ref {
              secret  = data.google_secret_manager_secret.governance_token_secret[0].secret_id
              version = "latest"
            }
          }
        }
      }

      # Previous signing secret, set only during rotation.
      dynamic "env" {
        for_each = var.governance_token_secret_previous_name != "" ? [1] : []
        content {
          name = "GOVERNANCE_DECISION_TOKEN_SECRET_PREVIOUS"
          value_source {
            secret_key_ref {
              secret  = data.google_secret_manager_secret.governance_token_secret_previous[0].secret_id
              version = "latest"
            }
          }
        }
      }
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  depends_on = [
    google_secret_manager_secret.secrets,
    google_service_account.runtime,
    # Revision creation validates secret access, so the accessor grants on the
    # shared decision-token secret(s) must exist before the service deploys.
    google_secret_manager_secret_iam_member.governance_token_secret_accessor,
    google_secret_manager_secret_iam_member.governance_token_secret_previous_accessor
  ]
}

# IAM policy for Cloud Run service
resource "google_cloud_run_v2_service_iam_member" "noauth" {
  count = var.allow_unauthenticated ? 1 : 0

  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.mcp_server.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# For authenticated access, grant specific service accounts or users
resource "google_cloud_run_v2_service_iam_member" "invokers" {
  for_each = toset(var.authorized_invokers)

  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.mcp_server.name
  role     = "roles/run.invoker"
  member   = each.value
}

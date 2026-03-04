# MCP Service Module for Cesteral
# Parameterized module: instantiated once per MCP server (dbm-mcp, dv360-mcp, ttd-mcp)
# Includes: Cloud Run service, Secret Manager, Cloud Scheduler, IAM

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

# Runtime service account for Cloud Run and Cloud Scheduler
resource "google_service_account" "runtime" {
  account_id   = "${var.service_name}-runtime"
  display_name = "Cesteral ${var.service_name} Runtime Service Account"
  description  = "Service account for ${var.service_name} runtime and scheduled jobs"
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

      # Environment variables - MCP server configuration
      env {
        name  = "MCP_TRANSPORT_TYPE"
        value = "http"
      }

      env {
        name  = "MCP_SESSION_MODE"
        value = var.mcp_session_mode
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
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  depends_on = [
    google_secret_manager_secret.secrets,
    google_service_account.runtime
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

# ============================================================================
# CLOUD SCHEDULER JOBS
# ============================================================================

# Pre-flight check job (runs 2 hours before campaign starts)
resource "google_cloud_scheduler_job" "preflight_check" {
  count = var.enable_scheduler_jobs ? 1 : 0

  name        = "${var.service_name}-preflight"
  description = "Pre-flight campaign checks for ${var.service_name}"
  project     = var.project_id
  region      = var.region
  schedule    = var.preflight_schedule
  time_zone   = var.scheduler_timezone

  http_target {
    http_method = "POST"
    uri         = "${google_cloud_run_v2_service.mcp_server.uri}/trigger/preflight"

    headers = {
      "Content-Type" = "application/json"
    }

    body = base64encode(jsonencode({
      job_type = "preflight_check"
    }))

    oidc_token {
      service_account_email = google_service_account.runtime.email
      audience              = google_cloud_run_v2_service.mcp_server.uri
    }
  }

  retry_config {
    retry_count          = 3
    max_retry_duration   = "1800s"
    min_backoff_duration = "60s"
    max_backoff_duration = "300s"
  }
}

# In-flight monitoring job (runs at regular intervals)
resource "google_cloud_scheduler_job" "inflight_monitor" {
  count = var.enable_scheduler_jobs ? 1 : 0

  name        = "${var.service_name}-inflight"
  description = "In-flight campaign monitoring for ${var.service_name}"
  project     = var.project_id
  region      = var.region
  schedule    = var.inflight_schedule
  time_zone   = var.scheduler_timezone

  http_target {
    http_method = "POST"
    uri         = "${google_cloud_run_v2_service.mcp_server.uri}/trigger/inflight"

    headers = {
      "Content-Type" = "application/json"
    }

    body = base64encode(jsonencode({
      job_type = "inflight_monitor"
    }))

    oidc_token {
      service_account_email = google_service_account.runtime.email
      audience              = google_cloud_run_v2_service.mcp_server.uri
    }
  }

  retry_config {
    retry_count          = 3
    max_retry_duration   = "900s"
    min_backoff_duration = "30s"
    max_backoff_duration = "180s"
  }
}

# Grant Cloud Scheduler service account permission to invoke jobs
resource "google_project_iam_member" "scheduler_job_runner" {
  count = var.enable_scheduler_jobs ? 1 : 0

  project = var.project_id
  role    = "roles/cloudscheduler.jobRunner"
  member  = "serviceAccount:${google_service_account.runtime.email}"
}

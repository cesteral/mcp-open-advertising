# Identity for the scheduled Terraform state drift check.
#
# Why (runbook 2026-07-27-dev-fleet-lb-recovery): a closed billing account had
# GCP reclaim 43 resources — the load balancer, VPC, serverless subnet, Cloud
# Router, Cloud NAT and 3 firewall rules. State still listed every one as
# existing, nothing noticed for a week, and mcp.cesteral.com was dead
# throughout. `.github/workflows/terraform-drift.yml` now plans on a schedule;
# this is the read-only identity it federates into.
#
# Read-only by construction: the workflow plans with `-lock=false`, so it never
# needs to write the state object or take the state lock.

variable "enable_drift_check_reader" {
  description = "Provision the Workload Identity Federation pool and read-only service account used by the scheduled Terraform drift check. The tfvars supplied to CI MUST set this to the same value used at apply time — otherwise the checker plans deletion of its own identity on every run and alerts on itself forever."
  type        = bool
  default     = false
}

variable "drift_check_github_repository_id" {
  description = "Numeric GitHub repository ID allowed to federate as the drift-check reader. Numeric rather than owner/name because a released name can be re-registered by someone else; the ID cannot."
  type        = string
  default     = "1182465548" # cesteral/mcp-open-advertising
}

variable "drift_check_github_owner_id" {
  description = "Numeric GitHub repository-owner ID allowed to federate as the drift-check reader."
  type        = string
  default     = "268389190" # cesteral
}

variable "drift_check_github_ref" {
  description = "Git ref allowed to federate. workflow_dispatch can target an arbitrary branch, so without this restriction any branch author could mint a credential against the live project."
  type        = string
  default     = "refs/heads/main"
}

variable "terraform_state_bucket" {
  description = "GCS bucket holding this environment's Terraform state. Empty string derives the conventional <project_id>-terraform-state."
  type        = string
  default     = ""
}

locals {
  drift_check_enabled = var.enable_drift_check_reader ? 1 : 0

  terraform_state_bucket = var.terraform_state_bucket != "" ? var.terraform_state_bucket : "${var.project_id}-terraform-state"
}

resource "google_iam_workload_identity_pool" "github" {
  count = local.drift_check_enabled

  project                   = var.project_id
  workload_identity_pool_id = "github-${var.environment}"
  display_name              = "GitHub Actions (${var.environment})"
  description               = "Keyless federation for GitHub Actions workflows. Currently: the scheduled Terraform drift check."
}

resource "google_iam_workload_identity_pool_provider" "github" {
  count = local.drift_check_enabled

  project                            = var.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github[0].workload_identity_pool_id
  workload_identity_pool_provider_id = "github-oidc"
  display_name                       = "GitHub OIDC"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
    # Numeric claims are mapped alongside the human-readable ones because the
    # attribute_condition below gates on the numeric forms.
    "attribute.repository_id"       = "assertion.repository_id"
    "attribute.repository_owner_id" = "assertion.repository_owner_id"
    "attribute.ref"                 = "assertion.ref"
  }

  # Without a condition, ANY GitHub repository on the public issuer could mint a
  # token for this pool. Restricted to this repository (by ID) AND the default
  # branch: workflow_dispatch accepts an arbitrary ref, so branch restriction is
  # what stops a feature-branch author from federating into the live project.
  attribute_condition = join(" && ", [
    "attribute.repository_owner_id == \"${var.drift_check_github_owner_id}\"",
    "attribute.repository_id == \"${var.drift_check_github_repository_id}\"",
    "attribute.ref == \"${var.drift_check_github_ref}\"",
  ])

  # allowed_audiences is deliberately UNSET, which selects the default audience.
  #
  # google-github-actions/auth defaults the OIDC token's `aud` to the literal
  # value of its `workload_identity_provider` input — the bare resource name
  # `projects/<num>/locations/global/workloadIdentityPools/<pool>/providers/<id>`,
  # with no scheme prefix. allowed_audiences matching is exact, so pinning it to
  # the `https://iam.googleapis.com/...` form would reject every token the
  # workflow presents and fail authentication after provisioning.
  #
  # Google's own GitHub Actions federation guide configures "Default audience"
  # for exactly this pairing. Do not add allowed_audiences here without also
  # setting the workflow's `audience` input to the identical string.
  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account" "drift_check_reader" {
  count = local.drift_check_enabled

  project      = var.project_id
  account_id   = "terraform-drift-reader"
  display_name = "Terraform drift check (read-only)"
  description  = "Federated identity for .github/workflows/terraform-drift.yml. Plans only; never applies."
}

# The binding that actually lets the workflow impersonate the reader. Scoped to
# the principalSet for this repository ID — the provider condition already gates
# admission to the pool, and this gates which workload may assume the account.
resource "google_service_account_iam_member" "drift_check_workload_identity" {
  count = local.drift_check_enabled

  service_account_id = google_service_account.drift_check_reader[0].name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github[0].name}/attribute.repository_id/${var.drift_check_github_repository_id}"
}

# Broad read-only — NOT least privilege. roles/viewer carries thousands of
# permissions that evolve with the platform. It is used because `terraform plan`
# refreshes every resource type in the stack (Cloud Run, Secret Manager metadata,
# compute, monitoring, IAM), and enumerating an equivalent custom role would
# drift out of date more dangerously than this is over-broad. It grants no
# mutation and no secret *payload* access.
resource "google_project_iam_member" "drift_check_viewer" {
  count = local.drift_check_enabled

  project = var.project_id
  role    = "roles/viewer"
  member  = "serviceAccount:${google_service_account.drift_check_reader[0].email}"
}

# Read the state object itself. objectViewer, not objectAdmin: the workflow
# plans with -lock=false and so never writes the lock or the state.
resource "google_storage_bucket_iam_member" "drift_check_state_reader" {
  count = local.drift_check_enabled

  bucket = local.terraform_state_bucket
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.drift_check_reader[0].email}"
}

output "drift_check_workload_identity_provider" {
  description = "Value for the workflow's google-github-actions/auth `workload_identity_provider` input"
  value       = var.enable_drift_check_reader ? google_iam_workload_identity_pool_provider.github[0].name : null
}

output "drift_check_service_account" {
  description = "Value for the workflow's google-github-actions/auth `service_account` input"
  value       = var.enable_drift_check_reader ? google_service_account.drift_check_reader[0].email : null
}

# Root Terraform outputs

# ============================================================================
# CORE INFRASTRUCTURE OUTPUTS
# ============================================================================

output "cloud_run_service_url" {
  description = "URL of the Cloud Run service"
  value       = module.core_infrastructure.cloud_run_service_url
}

output "cloud_run_service_name" {
  description = "Name of the Cloud Run service"
  value       = module.core_infrastructure.cloud_run_service_name
}

output "runtime_service_account_email" {
  description = "Email of the runtime service account"
  value       = module.core_infrastructure.runtime_service_account_email
}

output "secret_ids" {
  description = "Map of secret names to IDs"
  value       = module.core_infrastructure.secret_ids
  sensitive   = true
}

output "preflight_job_name" {
  description = "Name of pre-flight scheduler job"
  value       = module.core_infrastructure.preflight_job_name
}

output "inflight_job_name" {
  description = "Name of in-flight scheduler job"
  value       = module.core_infrastructure.inflight_job_name
}

# ============================================================================
# NETWORKING OUTPUTS
# ============================================================================

output "vpc_name" {
  description = "Name of the VPC network"
  value       = module.networking.vpc_name
}

output "vpc_connector_name" {
  description = "Name of the VPC connector"
  value       = module.networking.vpc_connector_name
}

output "cloud_nat_name" {
  description = "Name of the Cloud NAT"
  value       = module.networking.cloud_nat_name
}

# ============================================================================
# DEPLOYMENT INFO
# ============================================================================

output "deployment_info" {
  description = "Deployment information summary"
  value = {
    project_id  = var.project_id
    region      = var.region
    environment = var.environment
    service_url = module.core_infrastructure.cloud_run_service_url
  }
}

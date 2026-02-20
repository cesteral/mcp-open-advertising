# Root Terraform outputs

# ============================================================================
# DBM-MCP OUTPUTS
# ============================================================================

output "dbm_mcp_service_url" {
  description = "URL of the dbm-mcp Cloud Run service"
  value       = module.dbm_mcp.cloud_run_service_url
}

output "dbm_mcp_service_name" {
  description = "Name of the dbm-mcp Cloud Run service"
  value       = module.dbm_mcp.cloud_run_service_name
}

output "dbm_mcp_service_account_email" {
  description = "Email of the dbm-mcp runtime service account"
  value       = module.dbm_mcp.runtime_service_account_email
}

# ============================================================================
# DV360-MCP OUTPUTS
# ============================================================================

output "dv360_mcp_service_url" {
  description = "URL of the dv360-mcp Cloud Run service"
  value       = module.dv360_mcp.cloud_run_service_url
}

output "dv360_mcp_service_name" {
  description = "Name of the dv360-mcp Cloud Run service"
  value       = module.dv360_mcp.cloud_run_service_name
}

output "dv360_mcp_service_account_email" {
  description = "Email of the dv360-mcp runtime service account"
  value       = module.dv360_mcp.runtime_service_account_email
}

# ============================================================================
# TTD-MCP OUTPUTS
# ============================================================================

output "ttd_mcp_service_url" {
  description = "URL of the ttd-mcp Cloud Run service"
  value       = module.ttd_mcp.cloud_run_service_url
}

output "ttd_mcp_service_name" {
  description = "Name of the ttd-mcp Cloud Run service"
  value       = module.ttd_mcp.cloud_run_service_name
}

output "ttd_mcp_service_account_email" {
  description = "Email of the ttd-mcp runtime service account"
  value       = module.ttd_mcp.runtime_service_account_email
}

# ============================================================================
# SCHEDULER OUTPUTS (dbm-mcp only)
# ============================================================================

output "preflight_job_name" {
  description = "Name of pre-flight scheduler job"
  value       = module.dbm_mcp.preflight_job_name
}

output "inflight_job_name" {
  description = "Name of in-flight scheduler job"
  value       = module.dbm_mcp.inflight_job_name
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
    project_id    = var.project_id
    region        = var.region
    environment   = var.environment
    dbm_mcp_url   = module.dbm_mcp.cloud_run_service_url
    dv360_mcp_url = module.dv360_mcp.cloud_run_service_url
    ttd_mcp_url   = module.ttd_mcp.cloud_run_service_url
  }
}

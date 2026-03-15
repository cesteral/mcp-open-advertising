# Root Terraform outputs

output "dbm_mcp_service_url" {
  value = module.dbm_mcp.cloud_run_service_url
}

output "dv360_mcp_service_url" {
  value = module.dv360_mcp.cloud_run_service_url
}

output "ttd_mcp_service_url" {
  value = module.ttd_mcp.cloud_run_service_url
}

output "gads_mcp_service_url" {
  value = module.gads_mcp.cloud_run_service_url
}

output "meta_mcp_service_url" {
  value = module.meta_mcp.cloud_run_service_url
}

output "linkedin_mcp_service_url" {
  value = module.linkedin_mcp.cloud_run_service_url
}

output "tiktok_mcp_service_url" {
  value = module.tiktok_mcp.cloud_run_service_url
}

output "cm360_mcp_service_url" {
  value = module.cm360_mcp.cloud_run_service_url
}

output "sa360_mcp_service_url" {
  value = module.sa360_mcp.cloud_run_service_url
}

output "pinterest_mcp_service_url" {
  value = module.pinterest_mcp.cloud_run_service_url
}

output "snapchat_mcp_service_url" {
  value = module.snapchat_mcp.cloud_run_service_url
}

output "amazon_dsp_mcp_service_url" {
  value = module.amazon_dsp_mcp.cloud_run_service_url
}

output "msads_mcp_service_url" {
  value = module.msads_mcp.cloud_run_service_url
}

output "vpc_name" {
  value = module.networking.vpc_name
}

output "vpc_connector_name" {
  value = module.networking.vpc_connector_name
}

output "cloud_nat_name" {
  value = module.networking.cloud_nat_name
}

output "deployment_info" {
  value = {
    project_id         = var.project_id
    region             = var.region
    environment        = var.environment
    dbm_mcp_url        = module.dbm_mcp.cloud_run_service_url
    dv360_mcp_url      = module.dv360_mcp.cloud_run_service_url
    ttd_mcp_url        = module.ttd_mcp.cloud_run_service_url
    gads_mcp_url       = module.gads_mcp.cloud_run_service_url
    meta_mcp_url       = module.meta_mcp.cloud_run_service_url
    linkedin_mcp_url   = module.linkedin_mcp.cloud_run_service_url
    tiktok_mcp_url     = module.tiktok_mcp.cloud_run_service_url
    cm360_mcp_url      = module.cm360_mcp.cloud_run_service_url
    sa360_mcp_url      = module.sa360_mcp.cloud_run_service_url
    pinterest_mcp_url  = module.pinterest_mcp.cloud_run_service_url
    snapchat_mcp_url   = module.snapchat_mcp.cloud_run_service_url
    amazon_dsp_mcp_url = module.amazon_dsp_mcp.cloud_run_service_url
    msads_mcp_url      = module.msads_mcp.cloud_run_service_url
  }
}

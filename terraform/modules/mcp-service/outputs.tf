# Outputs for MCP Service Module

output "cloud_run_service_name" {
  description = "Name of the Cloud Run service"
  value       = google_cloud_run_v2_service.mcp_server.name
}

output "cloud_run_service_url" {
  description = "URL of the Cloud Run service"
  value       = google_cloud_run_v2_service.mcp_server.uri
}

output "cloud_run_service_id" {
  description = "Full resource ID of the Cloud Run service"
  value       = google_cloud_run_v2_service.mcp_server.id
}

output "runtime_service_account_email" {
  description = "Email of the runtime service account"
  value       = google_service_account.runtime.email
}

output "runtime_service_account_id" {
  description = "Full resource ID of the runtime service account"
  value       = google_service_account.runtime.id
}

output "secret_ids" {
  description = "Map of secret names to their resource IDs"
  value       = { for k, v in google_secret_manager_secret.secrets : k => v.id }
}

# Production environment configuration

# Project configuration
project_id  = "cesteral-prod"
region      = "europe-west2"
environment = "prod"

# Container images (update after first build)
dbm_mcp_image   = "europe-west2-docker.pkg.dev/cesteral-prod/cesteral/dbm-mcp:latest"
dv360_mcp_image = "europe-west2-docker.pkg.dev/cesteral-prod/cesteral/dv360-mcp:latest"
ttd_mcp_image   = "europe-west2-docker.pkg.dev/cesteral-prod/cesteral/ttd-mcp:latest"
gads_mcp_image  = "europe-west2-docker.pkg.dev/cesteral-prod/cesteral/gads-mcp:latest"
meta_mcp_image  = "europe-west2-docker.pkg.dev/cesteral-prod/cesteral/meta-mcp:latest"
linkedin_mcp_image = "europe-west2-docker.pkg.dev/cesteral-prod/cesteral/linkedin-mcp:latest"
tiktok_mcp_image = "europe-west2-docker.pkg.dev/cesteral-prod/cesteral/tiktok-mcp:latest"

# Networking
create_vpc             = true
serverless_subnet_cidr = "10.8.0.0/28"

# VPC connector - robust for production
connector_machine_type   = "e2-micro"
connector_min_instances  = 2
connector_max_instances  = 10
connector_min_throughput = 300
connector_max_throughput = 1000

# Cloud NAT
enable_nat_logging                  = true
nat_log_filter                      = "ERRORS_ONLY"
nat_min_ports_per_vm                = 64
enable_endpoint_independent_mapping = true # Better for production

# Cloud Run - production scaling
min_instances         = 1   # Always keep 1 warm
max_instances         = 10  # Scale up to 10 for peak loads
cpu_limit             = "2" # More CPU for production
memory_limit          = "1Gi"
cpu_always_allocated  = true # Faster response times
allow_unauthenticated = false

# MCP Server configuration
mcp_session_mode       = "stateless"
mcp_auth_mode          = "jwt"
log_level              = "info" # Production logging level
enable_gcs_persistence = false
gcs_bucket_name        = "cesteral-prod-mcp-persistence" # Enable when ready

# Cloud Scheduler - full production schedule
enable_scheduler_jobs = true
preflight_schedule    = "0 4,8,12,16,20 * * *" # Every 4 hours starting at 4am
inflight_schedule     = "0 * * * *"            # Every hour
scheduler_timezone    = "America/New_York"

# Artifact Registry
artifact_registry_repo_name = "cesteral"

# Monitoring
monitoring_notification_email = "daniel@cesteral.com"

# Per-service resource overrides (heavy reporting server gets more resources)
service_resource_overrides = {
  "dbm-mcp" = {
    cpu_limit     = "2"
    memory_limit  = "1Gi"
    max_instances = 10
  }
}

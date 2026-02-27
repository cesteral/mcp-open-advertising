# Production environment configuration

# Project configuration
project_id  = "cesteral-prod" # TODO: Replace with actual prod project ID
region      = "europe-west2"
environment = "prod"

# Container images (update after first build)
dbm_mcp_image   = "europe-west2-docker.pkg.dev/cesteral-prod/cesteral/dbm-mcp:latest"
dv360_mcp_image = "europe-west2-docker.pkg.dev/cesteral-prod/cesteral/dv360-mcp:latest"
ttd_mcp_image   = "europe-west2-docker.pkg.dev/cesteral-prod/cesteral/ttd-mcp:latest"
gads_mcp_image  = "europe-west2-docker.pkg.dev/cesteral-prod/cesteral/gads-mcp:latest"
meta_mcp_image  = "europe-west2-docker.pkg.dev/cesteral-prod/cesteral/meta-mcp:latest"

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
use_artifact_registry       = true
artifact_registry_repo_name = "cesteral"

# Monitoring
monitoring_notification_email = "daniel@cesteral.com"

# Fill in Cloud Run URLs after first `terraform apply`
monitoring_services = [
  { name = "dbm-mcp", url = "https://dbm-mcp-placeholder.europe-west2.run.app" },
  { name = "dv360-mcp", url = "https://dv360-mcp-placeholder.europe-west2.run.app" },
  { name = "ttd-mcp", url = "https://ttd-mcp-placeholder.europe-west2.run.app" },
  { name = "gads-mcp", url = "https://gads-mcp-placeholder.europe-west2.run.app" },
  { name = "meta-mcp", url = "https://meta-mcp-placeholder.europe-west2.run.app" },
]

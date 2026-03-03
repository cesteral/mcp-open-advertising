# Development environment configuration

# Project configuration
project_id  = "cesteral-labs"
region      = "europe-west2"
environment = "dev"

# Container images (update after first build)
dbm_mcp_image   = "europe-west2-docker.pkg.dev/cesteral-labs/cesteral/dbm-mcp:latest"
dv360_mcp_image = "europe-west2-docker.pkg.dev/cesteral-labs/cesteral/dv360-mcp:latest"
ttd_mcp_image   = "europe-west2-docker.pkg.dev/cesteral-labs/cesteral/ttd-mcp:latest"
gads_mcp_image  = "europe-west2-docker.pkg.dev/cesteral-labs/cesteral/gads-mcp:latest"
meta_mcp_image  = "europe-west2-docker.pkg.dev/cesteral-labs/cesteral/meta-mcp:latest"

# Networking
create_vpc             = true
serverless_subnet_cidr = "10.8.0.0/28"

# VPC connector - smaller for dev
connector_machine_type   = "e2-micro"
connector_min_instances  = 2
connector_max_instances  = 3
connector_min_throughput = 200
connector_max_throughput = 300

# Cloud NAT
enable_nat_logging                  = true
nat_log_filter                      = "ALL" # More verbose logging in dev
nat_min_ports_per_vm                = 64
enable_endpoint_independent_mapping = false

# Cloud Run - conservative scaling for dev
min_instances         = 0 # Scale to zero in dev
max_instances         = 3 # Lower max for dev
cpu_limit             = "1"
memory_limit          = "512Mi"
cpu_always_allocated  = false
allow_unauthenticated = false # Still require auth in dev

# MCP Server configuration
mcp_session_mode       = "stateless"
mcp_auth_mode          = "jwt"
log_level              = "debug" # More verbose logging in dev
enable_gcs_persistence = false
gcs_bucket_name        = "cesteral-labs-mcp-persistence" # Enable when ready

# Cloud Scheduler - less frequent in dev
enable_scheduler_jobs = true
preflight_schedule    = "0 8 * * *"   # Once daily at 8am
inflight_schedule     = "0 */3 * * *" # Every 3 hours
scheduler_timezone    = "America/New_York"

# Artifact Registry
artifact_registry_repo_name = "cesteral"

# Monitoring
monitoring_notification_email = "daniel@cesteral.com"

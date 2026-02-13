# Development environment configuration

# Project configuration
project_id  = "bidshifter-dev" # TODO: Replace with actual dev project ID
region      = "europe-west2"
environment = "dev"

# Container image (update after first build)
container_image = "europe-west2-docker.pkg.dev/bidshifter-dev/bidshifter/mcp-server:latest"

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
mcp_session_mode = "stateless"
mcp_auth_mode    = "jwt"
log_level        = "debug" # More verbose logging in dev

# Cloud Scheduler - less frequent in dev
enable_scheduler_jobs = true
preflight_schedule    = "0 8 * * *"       # Once daily at 8am
inflight_schedule     = "0 */3 * * *"     # Every 3 hours
scheduler_timezone    = "America/New_York"

# Artifact Registry
use_artifact_registry       = true
artifact_registry_repo_name = "bidshifter"

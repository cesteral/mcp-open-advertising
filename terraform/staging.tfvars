# Staging environment configuration

# Project configuration
project_id  = "bidshifter-staging" # TODO: Replace with actual staging project ID
region      = "europe-west2"
environment = "staging"

# Container image (update after first build)
container_image = "europe-west2-docker.pkg.dev/bidshifter-staging/bidshifter/mcp-server:latest"

# Networking
create_vpc             = true
serverless_subnet_cidr = "10.8.0.0/28"

# VPC connector - medium for staging
connector_machine_type   = "e2-micro"
connector_min_instances  = 2
connector_max_instances  = 4
connector_min_throughput = 200
connector_max_throughput = 400

# Cloud NAT
enable_nat_logging                  = true
nat_log_filter                      = "ERRORS_ONLY"
nat_min_ports_per_vm                = 64
enable_endpoint_independent_mapping = false

# Cloud Run - moderate scaling for staging
min_instances         = 1 # Keep 1 warm instance
max_instances         = 5
cpu_limit             = "1"
memory_limit          = "512Mi"
cpu_always_allocated  = false
allow_unauthenticated = false

# MCP Server configuration
mcp_session_mode = "stateless"
mcp_auth_mode    = "jwt"
log_level        = "info"

# Cloud Scheduler - production-like schedule
enable_scheduler_jobs = true
preflight_schedule    = "0 6,14,22 * * *" # 6am, 2pm, 10pm
inflight_schedule     = "0 * * * *"       # Every hour
scheduler_timezone    = "America/New_York"

# Artifact Registry
use_artifact_registry       = true
artifact_registry_repo_name = "bidshifter"

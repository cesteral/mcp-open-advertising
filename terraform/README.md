# Cesteral Terraform Infrastructure

Terraform configuration for deploying the Cesteral MCP Servers to GCP Cloud Run.

## Architecture

```
terraform/
├── main.tf                 # Root orchestration (modules, locals, provider)
├── variables.tf            # All input variables
├── outputs.tf              # Service URLs, networking info, deployment summary
├── backend-{dev,prod}.conf # GCS backend config per environment
├── {dev,prod}.tfvars       # Environment-specific values
└── modules/
    ├── mcp-service/        # Parameterized Cloud Run service (instantiated 13x)
    ├── networking/         # VPC, VPC connector, Cloud NAT, firewall rules
    └── monitoring/         # Uptime checks, alert policies, dashboard
```

### Module: `mcp-service`

Instantiated once per MCP server across all 13 services. Creates:

- Cloud Run v2 service with health probes
- Service account with least-privilege IAM
- Secret Manager secrets (values managed externally)

### Module: `networking`

Creates shared networking infrastructure:

- VPC with private Google Access
- Serverless VPC Access Connector for Cloud Run
- Cloud NAT for egress to external APIs
- Firewall rules (health checks, API egress)

### Module: `monitoring`

Creates observability infrastructure:

- Uptime checks per service
- Alert policies (error rate, P99 latency, instance count, uptime)
- Custom log-based metric for access denied events
- Monitoring dashboard with fleet-wide widgets

## Environments

| Environment | Project ID              | State Bucket                            | Key Differences                                |
| ----------- | ----------------------- | --------------------------------------- | ---------------------------------------------- |
| **dev**     | `YOUR_GCP_PROJECT_DEV`  | `YOUR_GCP_PROJECT_DEV-terraform-state`  | Scale-to-zero, debug logging, verbose NAT logs |
| **prod**    | `YOUR_GCP_PROJECT_PROD` | `YOUR_GCP_PROJECT_PROD-terraform-state` | Always-allocated CPU, 2 vCPU, 1Gi memory       |

## Common Operations

### First-time setup

> The complete one-time walkthrough (bootstrap script, registry import, decision-token secret, invoker access) lives in [docs/guides/first-deploy-checklist.md](../docs/guides/first-deploy-checklist.md). The short version:

```bash
# 0. Copy example files and fill in your values
cp backend-dev.conf.example backend-dev.conf
cp dev.tfvars.example dev.tfvars

# 1. Create the state bucket (once per environment)
gsutil mb -l europe-west2 gs://YOUR_GCP_PROJECT_DEV-terraform-state

# 2. Initialize terraform with backend config
cd terraform
terraform init -backend-config=backend-dev.conf

# 3. Review and apply
terraform plan -var-file=dev.tfvars   # mcp_images in the tfvars, or -var-file=<images>.tfvars.json
terraform apply
```

### Switching environments

```bash
# Re-initialize with different backend
terraform init -backend-config=backend-prod.conf -reconfigure
terraform plan -var-file=prod.tfvars ...
```

### Deploying with the deploy script

```bash
# Full build + deploy
./scripts/deploy.sh dev

# Skip Docker build (use existing images)
./scripts/deploy.sh dev --skip-build

# Plan only (no apply)
./scripts/deploy.sh dev --plan-only
```

### Adding a new MCP server

Services are one `module "mcp_service"` with `for_each` over the servers in `../registry.json`, so registering a server there adds its Cloud Run service, monitoring and load-balancer route. Three per-service maps are still written by hand, and `scripts/lib/fleet-inventory.test.mjs` fails until the server is in each:

1. `local.service_auth_defaults` in `main.tf`: the default `MCP_AUTH_MODE`, one of the server's registry `auth.modes`.
2. The `mcp_secret_env_vars` default in `variables.tf`: env var → Secret Manager secret (`secret_names` are derived from it).
3. `mcp_images` in `dev.tfvars.example` and `prod.tfvars.example`, and in your real tfvars.

Cloud Build and `scripts/deploy.sh` read the server list from the registry, so they need no change.

### Migrating tfvars to the for_each layout

The 13 per-server variables became two maps keyed by package name: `<server>_mcp_image` → `mcp_images`, and `<server>_secret_env_vars` → `mcp_secret_env_vars`. Terraform only _warns_ about a tfvars entry for a variable that no longer exists, so the plan steps in Cloud Build and `deploy.sh` now fail on that warning, and `mcp_images` is required. A tfvars file still in the old shape therefore fails loudly rather than falling back to defaults. Convert it before the first plan after this change:

```hcl
mcp_images = {
  "dbm-mcp" = "europe-west2-docker.pkg.dev/<project>/cesteral/dbm-mcp:latest"
  # ... one entry per server in registry.json
}

# Only if you override the defaults in variables.tf. Setting it replaces the
# whole map, so include every server.
mcp_secret_env_vars = {
  "dbm-mcp" = {
    MCP_AUTH_SECRET_KEY = { secret_name = "cesteral-jwt-secret-key", version = "latest" }
  }
  # ...
}
```

`moved.tf` moves each `module.<server>_mcp` to `module.mcp_service["<server>-mcp"]`. The first plan after the change should show 13 moves and no adds, changes or destroys. Anything else means the tfvars were not converted faithfully.

### Inspecting current state

```bash
# List all resources
terraform state list

# Show a specific resource
terraform state show 'module.mcp_service["dbm-mcp"].google_cloud_run_v2_service.mcp_server'

# View all outputs
terraform output

# Service URLs, keyed by package
terraform output service_urls
```

## Secrets Management

Secrets are created by Terraform but **values are managed externally** (via GCP Console or `gcloud`):

```bash
# Set a secret value
echo -n "my-secret-value" | gcloud secrets versions add cesteral-jwt-secret-key --data-file=-

# View secret metadata
gcloud secrets describe cesteral-jwt-secret-key

# List all secret versions
gcloud secrets versions list cesteral-jwt-secret-key
```

The secret-to-env-var mapping is the `mcp_secret_env_vars` map in `variables.tf`, keyed by package. Each service's `secret_names` list is derived from it in `local.mcp_service_inputs` to avoid dual-maintenance.

## Per-Service Resource Overrides

By default, all services share the same Cloud Run scaling/resource config. Use `service_resource_overrides` to customize specific services:

```hcl
# In prod.tfvars
service_resource_overrides = {
  "dbm-mcp" = {
    cpu_limit     = "2"
    memory_limit  = "1Gi"
    max_instances = 1
  }
}
```

## Instance cap (max 1 per service)

Every fleet service runs with `max_instances = 1` (`local.fleet_max_instances_cap` in `main.tf`, applied with `min()` so no tfvars value or override raises it). MCP session state is per instance, and a client that loses its session recovers by re-initializing, which could land on another instance, so scale-out breaks sessions. There is deliberately no Cloud Run `session_affinity` and no shared store. Remove the cap when stateless MCP ([#243](https://github.com/cesteral/cesteral-mcp-servers/issues/243)) ships. Rate limiting is per process, so this also keeps the per-process limits equal to the fleet limits.

## Important Notes

- **Lock file**: `.terraform.lock.hcl` is committed to version control for reproducible provider versions
- **Provider version**: Pinned to `~> 5.45` for stability
- **prevent_destroy**: Critical resources (service accounts, secrets, VPC) have `prevent_destroy` lifecycle rules
- **State locking**: GCS backend provides automatic state locking via object generation numbers
- **Monitoring URLs**: Service URLs for uptime checks are derived dynamically from Cloud Run module outputs

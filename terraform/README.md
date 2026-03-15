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

| Environment | Project ID | State Bucket | Key Differences |
|---|---|---|---|
| **dev** | `open-agentic-advertising-dev` | `open-agentic-advertising-dev-terraform-state` | Scale-to-zero, debug logging, verbose NAT logs |
| **prod** | `open-agentic-advertising-prod` | `open-agentic-advertising-prod-terraform-state` | Always-allocated CPU, 2 vCPU, 1Gi memory |

## Common Operations

### First-time setup

```bash
# 1. Create the state bucket (once per environment)
gsutil mb -l europe-west2 gs://open-agentic-advertising-dev-terraform-state

# 2. Initialize terraform with backend config
cd terraform
terraform init -backend-config=backend-dev.conf

# 3. Review and apply
terraform plan -var-file=dev.tfvars -var="dbm_mcp_image=..." ...
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

1. Add a container image variable in `variables.tf`:
   ```hcl
   variable "new_mcp_image" {
     description = "Full container image URL for new-mcp server"
     type        = string
   }
   ```

2. Add secret env var config in `variables.tf` (the `secret_names` are derived automatically from the env var map):
   ```hcl
   variable "new_secret_env_vars" {
     type = map(object({ secret_name = string, version = string }))
     default = {
       MCP_AUTH_SECRET_KEY = { secret_name = "cesteral-jwt-secret-key", version = "latest" }
     }
   }
   ```

3. Add a module block in `main.tf` and derive secret names in the `locals` block.

4. Add outputs in `outputs.tf`.

5. Add the container image to all `.tfvars` files.

6. Update `cloudbuild.yaml` and `scripts/deploy.sh` to build/push/deploy the new server.

### Inspecting current state

```bash
# List all resources
terraform state list

# Show a specific resource
terraform state show module.dbm_mcp.google_cloud_run_v2_service.mcp_server

# View all outputs
terraform output

# View specific output
terraform output dbm_mcp_service_url
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

The secret-to-env-var mapping is defined in `variables.tf` via `*_secret_env_vars` maps. The `secret_names` lists are derived automatically from these maps in `main.tf` locals to avoid dual-maintenance.

## Per-Service Resource Overrides

By default, all services share the same Cloud Run scaling/resource config. Use `service_resource_overrides` to customize specific services:

```hcl
# In prod.tfvars
service_resource_overrides = {
  "dbm-mcp" = {
    cpu_limit     = "2"
    memory_limit  = "1Gi"
    max_instances = 10
  }
}
```

## Important Notes

- **Lock file**: `.terraform.lock.hcl` is committed to version control for reproducible provider versions
- **Provider version**: Pinned to `~> 5.45` for stability
- **prevent_destroy**: Critical resources (service accounts, secrets, VPC) have `prevent_destroy` lifecycle rules
- **State locking**: GCS backend provides automatic state locking via object generation numbers
- **Monitoring URLs**: Service URLs for uptime checks are derived dynamically from Cloud Run module outputs

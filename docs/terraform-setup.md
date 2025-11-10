# Terraform Setup Guide for Campaign Guardian

This guide walks through setting up and using Terraform to deploy the Campaign Guardian MCP Server to Google Cloud Platform.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Architecture Overview](#architecture-overview)
3. [Initial Setup](#initial-setup)
4. [Terraform Structure](#terraform-structure)
5. [Configuration](#configuration)
6. [Deployment](#deployment)
7. [Managing State](#managing-state)
8. [Troubleshooting](#troubleshooting)

## Prerequisites

### Required Tools

- **gcloud CLI** (>= 400.0.0)
  ```bash
  # Install
  curl https://sdk.cloud.google.com | bash

  # Verify
  gcloud version
  ```

- **Terraform** (>= 1.5.0)
  ```bash
  # macOS (Homebrew)
  brew install terraform

  # Linux
  wget https://releases.hashicorp.com/terraform/1.5.0/terraform_1.5.0_linux_amd64.zip
  unzip terraform_1.5.0_linux_amd64.zip
  sudo mv terraform /usr/local/bin/

  # Verify
  terraform version
  ```

- **Docker** (for building container images)
  ```bash
  # macOS/Windows: Install Docker Desktop
  # Linux: Follow docker.com instructions

  # Verify
  docker --version
  ```

### GCP Permissions

You need one of the following IAM roles in the target GCP project:

- **Project Owner** (for initial setup)
- **Project Editor** (minimum for deployment)
- Custom role with these permissions:
  - Cloud Run Admin
  - Secret Manager Admin
  - Cloud Scheduler Admin
  - Compute Network Admin
  - VPC Access Admin
  - Service Account Admin
  - Storage Admin
  - Artifact Registry Admin

### Authentication

```bash
# Authenticate with Google Cloud
gcloud auth login

# Set application default credentials (for Terraform)
gcloud auth application-default login

# Set default project (optional)
gcloud config set project PROJECT_ID
```

## Architecture Overview

The Terraform configuration deploys the following GCP resources:

### Networking Stack
- **VPC Network** (optional, can use existing)
- **Subnet** for Serverless VPC Access Connector
- **VPC Access Connector** (connects Cloud Run to VPC)
- **Cloud Router** for NAT
- **Cloud NAT** (outbound internet access for API calls)
- **Firewall Rules** (Google APIs, external APIs, health checks)

### Compute & Application
- **Cloud Run Service** (HTTP/2, containerized MCP server)
- **Service Account** (runtime identity with least privilege)
- **IAM Bindings** (Secret accessor, logging, monitoring, Vertex AI)

### Secrets & Configuration
- **Secret Manager Secrets** (8 secrets for credentials)
  - JWT secret key
  - DV360 OAuth credentials (3 secrets)
  - Bid Manager API key
  - Beam/Databridge API key
  - Teams bot credentials (2 secrets)

### Automation & Monitoring
- **Cloud Scheduler Jobs** (2 jobs)
  - Pre-flight checks (before campaign starts)
  - In-flight monitoring (during campaign)
- **Cloud Logging** (automatic via Cloud Run)
- **Cloud Monitoring** (metrics via Cloud Run)
- **Cloud Trace** (distributed tracing)

### State Management
- **GCS Bucket** (Terraform state storage with versioning)

## Initial Setup

### 1. Update Project IDs

Before running any scripts, update the project IDs in these files:

**terraform/dev.tfvars**
```hcl
project_id = "your-actual-dev-project-id"
```

**terraform/staging.tfvars**
```hcl
project_id = "your-actual-staging-project-id"
```

**terraform/prod.tfvars**
```hcl
project_id = "your-actual-prod-project-id"
```

**scripts/init-gcp-project.sh** (3 places)
```bash
dev)
    PROJECT_ID="your-actual-dev-project-id"
    ;;
staging)
    PROJECT_ID="your-actual-staging-project-id"
    ;;
prod)
    PROJECT_ID="your-actual-prod-project-id"
    ;;
```

**scripts/create-secrets.sh** (same 3 places)

**scripts/deploy.sh** (same 3 places)

### 2. Initialize GCP Project

Run the initialization script to set up required APIs, service accounts, and buckets:

```bash
./scripts/init-gcp-project.sh dev
```

This will:
- Enable 14 required GCP APIs
- Create Artifact Registry repository
- Create GCS bucket for Terraform state
- Create Terraform service account with permissions
- Create GCS bucket for build artifacts

**Expected output:**
```
[INFO] Initializing GCP project: your-project-id (environment: dev)
[INFO] Enabling required GCP APIs...
[INFO] All required APIs enabled successfully!
[INFO] Creating Artifact Registry repository...
[INFO] Terraform state bucket created: gs://your-project-id-terraform-state
...
[INFO] GCP Project Initialization Complete!
```

### 3. Create Secrets

Run the secrets creation script to set up Secret Manager:

```bash
./scripts/create-secrets.sh dev
```

You'll be prompted for each secret value. Have these ready:

- **JWT Secret Key**: Generate with `openssl rand -base64 32`
- **DV360 OAuth Client ID**: From Google Cloud Console
- **DV360 OAuth Client Secret**: From Google Cloud Console
- **DV360 Refresh Token**: From OAuth flow
- **Bid Manager API Key**: From Bid Manager API console
- **Beam API Key**: From Beam/Databridge provider
- **Teams App ID**: From Azure AD app registration
- **Teams App Secret**: From Azure AD app registration

**Tips:**
- Paste values carefully (no leading/trailing spaces)
- You can re-run to update existing secrets
- Secrets are encrypted at rest by Google

## Terraform Structure

```
terraform/
├── main.tf                           # Root module orchestration
├── variables.tf                      # Input variable definitions
├── outputs.tf                        # Output values
├── versions.tf                       # Terraform/provider versions
├── backend-dev.conf                  # Dev backend config
├── backend-staging.conf              # Staging backend config
├── backend-prod.conf                 # Prod backend config
├── dev.tfvars                        # Dev environment values
├── staging.tfvars                    # Staging environment values
├── prod.tfvars                       # Prod environment values
├── .gitignore                        # Terraform-specific ignores
└── modules/
    ├── core-infrastructure/          # Cloud Run, secrets, scheduler
    │   ├── main.tf
    │   ├── variables.tf
    │   └── outputs.tf
    └── networking/                   # VPC, NAT, firewall
        ├── main.tf
        ├── variables.tf
        └── outputs.tf
```

### Module Breakdown

**core-infrastructure** module contains:
- Cloud Run service configuration
- Service account creation and IAM bindings
- Secret Manager secrets
- Cloud Scheduler jobs
- Environment variable mapping

**networking** module contains:
- VPC network (optional creation)
- Serverless VPC Access Connector
- Cloud Router and Cloud NAT
- Firewall rules

## Configuration

### Environment-Specific Variables

Each environment has a `.tfvars` file with customized settings:

| Variable | Dev | Staging | Prod |
|----------|-----|---------|------|
| `min_instances` | 0 (scale to zero) | 1 (always warm) | 1 (always warm) |
| `max_instances` | 3 | 5 | 10 |
| `cpu_limit` | 1 | 1 | 2 |
| `memory_limit` | 512Mi | 512Mi | 1Gi |
| `cpu_always_allocated` | false | false | true |
| `log_level` | debug | info | info |
| `preflight_schedule` | Daily | 3x daily | 5x daily |
| `inflight_schedule` | Every 3h | Hourly | Hourly |

### Key Configuration Variables

**Networking:**
```hcl
create_vpc             = true              # Create new VPC or use existing
serverless_subnet_cidr = "10.8.0.0/28"    # /28 minimum for connector
connector_machine_type = "e2-micro"        # f1-micro, e2-micro, e2-standard-4
```

**Cloud Run:**
```hcl
container_image        = "europe-west2-docker.pkg.dev/..."
min_instances          = 0                 # 0 = scale to zero
max_instances          = 10                # Max concurrent instances
allow_unauthenticated  = false             # Require authentication
```

**MCP Server:**
```hcl
mcp_session_mode = "stateless"             # stateless, stateful, auto
mcp_auth_mode    = "jwt"                   # none, jwt, oauth
log_level        = "info"                  # debug, info, warn, error
```

**Scheduler:**
```hcl
enable_scheduler_jobs = true
preflight_schedule    = "0 6,14,22 * * *"  # Cron format
inflight_schedule     = "0 * * * *"        # Every hour
scheduler_timezone    = "America/New_York"
```

## Deployment

### Using Helper Scripts (Recommended)

The easiest way to deploy is using the `deploy.sh` script:

```bash
# Full deployment (build + infrastructure)
./scripts/deploy.sh dev

# Skip Docker build (use existing image)
./scripts/deploy.sh dev --skip-build

# Plan only (no apply)
./scripts/deploy.sh dev --plan-only

# Production (requires confirmation)
./scripts/deploy.sh prod
```

### Manual Deployment

If you prefer manual control:

```bash
# 1. Build and push Docker image
docker build -t europe-west2-docker.pkg.dev/PROJECT_ID/campaign-guardian/mcp-server:TAG .
docker push europe-west2-docker.pkg.dev/PROJECT_ID/campaign-guardian/mcp-server:TAG

# 2. Configure Docker authentication
gcloud auth configure-docker europe-west2-docker.pkg.dev

# 3. Initialize Terraform
cd terraform
terraform init -backend-config=backend-dev.conf

# 4. Plan changes
terraform plan \
  -var="container_image=europe-west2-docker.pkg.dev/PROJECT_ID/campaign-guardian/mcp-server:TAG" \
  -var-file=dev.tfvars \
  -out=tfplan

# 5. Apply changes
terraform apply tfplan

# 6. View outputs
terraform output
```

### Verification

After deployment, verify the service is running:

```bash
# Get service URL
SERVICE_URL=$(terraform output -raw cloud_run_service_url)

# Test health endpoint
curl $SERVICE_URL/health

# Expected response:
# {"status":"healthy","timestamp":"..."}
```

## Managing State

### State Backend

Terraform state is stored in GCS with:
- **Versioning enabled** (keeps history of state changes)
- **Lifecycle policy** (deletes versions older than 30 days, keeps last 3)
- **Encryption at rest** (automatic with GCS)

### State Commands

```bash
# List state resources
terraform state list

# Show specific resource
terraform state show module.core_infrastructure.google_cloud_run_v2_service.mcp_server

# Pull current state (for inspection)
terraform state pull > state.json

# Force unlock (if locked due to failed run)
terraform force-unlock LOCK_ID
```

### State Hygiene

- **Never edit state manually** (use `terraform state` commands)
- **Never commit state files to git** (stored in GCS)
- **Use workspaces sparingly** (we use separate tfvars instead)
- **Review state changes** in plan output before applying

## Troubleshooting

### Common Issues

**1. Backend initialization fails**
```
Error: Failed to get existing workspaces
```
**Solution:** Ensure GCS bucket exists and you have access
```bash
gsutil ls gs://PROJECT_ID-terraform-state
gcloud auth application-default login
```

**2. API not enabled**
```
Error: Error 403: ... API has not been used in project
```
**Solution:** Run init script or enable API manually
```bash
./scripts/init-gcp-project.sh dev
# OR
gcloud services enable SERVICE_NAME.googleapis.com --project=PROJECT_ID
```

**3. Secret not found**
```
Error: Error retrieving available secret manager secret versions
```
**Solution:** Create secrets first
```bash
./scripts/create-secrets.sh dev
```

**4. VPC connector creation slow**
```
Still creating... [5m0s elapsed]
```
**Solution:** Normal! VPC connector takes 5-10 minutes to create. Be patient.

**5. Insufficient permissions**
```
Error: Error creating Service: googleapi: Error 403: Permission denied
```
**Solution:** Check IAM roles on your user account or service account
```bash
gcloud projects get-iam-policy PROJECT_ID \
  --flatten="bindings[].members" \
  --filter="bindings.members:user:YOUR_EMAIL"
```

**6. Container image not found**
```
Error: spec.template.spec.containers[0].image: invalid image reference
```
**Solution:** Build and push Docker image first, or update `container_image` variable

### Debug Mode

Enable Terraform debug logging:

```bash
export TF_LOG=DEBUG
export TF_LOG_PATH=terraform-debug.log
terraform plan
```

### Force Recreate

To force recreation of a specific resource:

```bash
terraform taint module.core_infrastructure.google_cloud_run_v2_service.mcp_server
terraform apply
```

### Destroy Infrastructure

To tear down all resources (use with caution!):

```bash
cd terraform
terraform destroy -var-file=dev.tfvars

# For specific resources only
terraform destroy -target=module.networking
```

## Next Steps

- [GCP Deployment Guide](./gcp-deployment.md) - Architecture and operational details
- [MCP Server Configuration](./mcp-server-config.md) - Environment variables and settings
- [Scripts README](../scripts/README.md) - Helper script documentation

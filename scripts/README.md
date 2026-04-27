# Cesteral Deployment Scripts

This directory contains helper scripts for deploying and managing the Cesteral MCP servers on GCP.

## Scripts Overview

### 1. `init-gcp-project.sh`

Initializes a GCP project with all required resources and configurations.

**Usage:**

```bash
./scripts/init-gcp-project.sh <environment>
```

**Example:**

```bash
./scripts/init-gcp-project.sh dev
```

**What it does:**

- Enables required GCP APIs (Cloud Run, Secret Manager, etc.)
- Creates Artifact Registry repository for container images
- Creates GCS bucket for Terraform state with versioning
- Creates Terraform service account with necessary permissions
- Creates GCS bucket for build artifacts

**Prerequisites:**

- gcloud CLI installed and authenticated
- Project Owner or Editor role in the target GCP project
- Update project IDs in the script before running

### 2. `create-secrets.sh`

Interactively creates and populates Secret Manager secrets.

**Usage:**

```bash
./scripts/create-secrets.sh <environment>
```

**Example:**

```bash
./scripts/create-secrets.sh dev
```

**What it does:**

- Creates Secret Manager secrets for the full 13-server fleet
- Covers shared auth plus DBM/DV360/CM360 service-account JSON, Google Ads, SA360, TTD, Meta, LinkedIn, TikTok, Pinterest, Snapchat, Amazon DSP, and Microsoft Ads credentials
- Prompts for each secret value interactively
- Stores secrets securely in Secret Manager

**Prerequisites:**

- `init-gcp-project.sh` must be run first
- Have all API credentials ready before running

**Tips:**

- Generate JWT secret: `openssl rand -base64 32`
- You can re-run to update existing secrets

### 3. `deploy.sh`

Builds Docker images for all servers and deploys infrastructure using Terraform.

**Usage:**

```bash
./scripts/deploy.sh <environment> [--skip-build] [--plan-only]
```

**Examples:**

```bash
# Full deployment (build + deploy)
./scripts/deploy.sh dev

# Deploy with existing image (skip build)
./scripts/deploy.sh dev --skip-build

# Only run Terraform plan (no apply)
./scripts/deploy.sh dev --plan-only

# Production deployment (requires confirmation)
./scripts/deploy.sh prod
```

**What it does:**

- Builds Docker images for `dbm-mcp`, `dv360-mcp`, `ttd-mcp`, `gads-mcp`, `meta-mcp`, `linkedin-mcp`, and `tiktok-mcp`
- Pushes images to Artifact Registry
- Initializes Terraform with environment-specific backend
- Runs Terraform plan
- Applies Terraform configuration (creates/updates infrastructure)
- Displays service URLs and helpful commands

**Prerequisites:**

- Docker installed and running
- Terraform installed (>= 1.5.0)
- `init-gcp-project.sh` and `create-secrets.sh` must be run first
- Update project IDs in tfvars files

**Flags:**

- `--skip-build`: Skip Docker build and push, use existing image
- `--plan-only`: Only run `terraform plan`, don't apply changes

## Deployment Workflow

### Initial Setup (One-time per environment)

1. **Initialize GCP Project**

   ```bash
   ./scripts/init-gcp-project.sh dev
   ```

2. **Create Secrets**

   ```bash
   ./scripts/create-secrets.sh dev
   ```

3. **Initial Deployment**
   ```bash
   ./scripts/deploy.sh dev
   ```

### Regular Deployments

For code changes or configuration updates:

```bash
# Full deployment
./scripts/deploy.sh dev

# Or for faster deployment if image hasn't changed:
./scripts/deploy.sh dev --skip-build
```

### Production Deployment

Production deployments require extra confirmation:

```bash
# Always test with plan first
./scripts/deploy.sh prod --plan-only

# Review plan, then deploy
./scripts/deploy.sh prod
# (will prompt for confirmation)
```

## Alternative: Cloud Build CI/CD

For automated deployments, use Cloud Build instead:

```bash
# Manual trigger via gcloud
gcloud builds submit \
  --config=cloudbuild.yaml \
  --substitutions=_ENVIRONMENT=dev \
  --project=YOUR_GCP_PROJECT_DEV

# Or set up automated triggers in Cloud Console
# Triggers > Create Trigger > Connect Repository
```

## Troubleshooting

### Permission Denied

```bash
chmod +x scripts/*.sh
```

### gcloud not authenticated

```bash
gcloud auth login
gcloud auth application-default login
```

### Docker not running

```bash
# macOS/Windows
# Start Docker Desktop

# Linux
sudo systemctl start docker
```

### Terraform state locked

```bash
# If deployment failed mid-run
cd terraform
terraform force-unlock <LOCK_ID>
```

### Secret not found

```bash
# List secrets
gcloud secrets list --project=YOUR_GCP_PROJECT_DEV

# Re-run secret creation
./scripts/create-secrets.sh dev
```

## Manual Commands

### View Cloud Run services

```bash
for SERVICE in dbm-mcp dv360-mcp ttd-mcp gads-mcp meta-mcp linkedin-mcp tiktok-mcp cm360-mcp sa360-mcp pinterest-mcp snapchat-mcp amazon-dsp-mcp msads-mcp; do
  gcloud run services describe "$SERVICE" \
    --region=europe-west2 \
    --project=YOUR_GCP_PROJECT_DEV
done
```

### View logs

```bash
gcloud logging read \
  'resource.type=cloud_run_revision AND resource.labels.service_name=~"(dbm|dv360|ttd|gads|meta|linkedin|tiktok|cm360|sa360|pinterest|snapchat|amazon-dsp|msads)-mcp"' \
  --limit 50 \
  --project=YOUR_GCP_PROJECT_DEV
```

### Test health endpoints

```bash
for SERVICE in dbm-mcp dv360-mcp ttd-mcp gads-mcp meta-mcp linkedin-mcp tiktok-mcp cm360-mcp sa360-mcp pinterest-mcp snapchat-mcp amazon-dsp-mcp msads-mcp; do
  SERVICE_URL=$(gcloud run services describe "$SERVICE" \
    --region=europe-west2 \
    --project=YOUR_GCP_PROJECT_DEV \
    --format='value(status.url)')
  curl "$SERVICE_URL/health"
done
```

## Security Notes

- Never commit secrets or sensitive values to git
- All secrets are stored in Secret Manager, not in code
- Service accounts follow principle of least privilege
- Production deployments require manual confirmation
- Terraform state is encrypted and versioned in GCS

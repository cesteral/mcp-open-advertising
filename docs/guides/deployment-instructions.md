# Deployment Instructions

This guide covers the full deployment flow for Cesteral MCP Servers on GCP Cloud Run, including both **Intelligence mode** (hosted by Cesteral) and **standalone self-hosted mode**.

## Prerequisites

- **gcloud CLI** — authenticated with access to the target GCP project
- **Terraform** >= 1.5.0
- **Docker** — for building container images
- **Node.js** >= 20 and **pnpm** >= 8.15
- **GCP project** with billing enabled (one per environment: dev, prod)

## Deployment Modes

Cesteral MCP Servers are stateless connectors. They never persist platform credentials — they receive them per-request and use them for that request only. How credentials reach the servers depends on the deployment mode.

### Intelligence Mode (Hosted)

MCP servers run behind the Cesteral Intelligence control plane. Intelligence handles credential storage (encrypted via KMS), user onboarding, and per-request credential relay.

**What you need in Secret Manager:** Only `cesteral-jwt-secret-key` (for MCP ingress authentication between Intelligence and the servers).

**How credentials flow:**
1. User stores platform credentials in Intelligence UI → encrypted at rest via GCP KMS
2. On each request, Intelligence decrypts credentials and injects them as HTTP headers
3. MCP server's auth strategy extracts credentials from headers, uses them for the API call, discards them

### Standalone / Self-Hosted Mode

You run the MCP servers directly without Intelligence. Platform credentials are stored in GCP Secret Manager and mounted as environment variables on each Cloud Run service.

**What you need in Secret Manager:** The full credential set for every platform you want to use (up to 40 secrets — see Step 3).

## Step 1: Authenticate

```bash
# Login to gcloud
gcloud auth login

# Set application default credentials (needed for Terraform)
gcloud auth application-default login
```

## Step 2: Initialize GCP Project

Run the one-time project setup script. This is idempotent — safe to re-run.

```bash
./scripts/init-gcp-project.sh <dev|prod>
```

**What it creates:**

| Resource | Details |
|----------|---------|
| **GCP APIs** | 14 APIs enabled (Cloud Run, Secret Manager, Artifact Registry, VPC Access, Cloud Build, etc.) |
| **Artifact Registry** | `cesteral` Docker repository in `europe-west2` |
| **Terraform state bucket** | `{PROJECT_ID}-terraform-state` with versioning and 90-day lifecycle |
| **Build artifacts bucket** | `{PROJECT_ID}-build-artifacts` |
| **Terraform service account** | `terraform-deployer@{PROJECT_ID}.iam.gserviceaccount.com` with least-privilege roles |

## Step 3: Populate Secrets

```bash
./scripts/create-secrets.sh <dev|prod>
```

This script interactively prompts for each secret. It checks if each secret already exists and offers to update or skip.

**Intelligence mode minimum:** Only `cesteral-jwt-secret-key` is required. Skip all platform-specific secrets.

**Self-hosted mode:** Populate all secrets for the platforms you need. Reference the [secret collection sheet](./open-agentic-advertising-dev-secret-collection-sheet.md) for the full list of required values per platform.

<details>
<summary>Full secret inventory (40 secrets)</summary>

| Platform | Secrets |
|----------|---------|
| **Shared** | `cesteral-jwt-secret-key` |
| **DBM** | `cesteral-dbm-service-account-json` |
| **DV360** | `cesteral-dv360-service-account-json` |
| **CM360** | `cesteral-cm360-service-account-json` |
| **Google Ads** | `cesteral-gads-developer-token`, `cesteral-gads-client-id`, `cesteral-gads-client-secret`, `cesteral-gads-refresh-token`, `cesteral-gads-login-customer-id` |
| **Meta** | `cesteral-meta-app-id`, `cesteral-meta-app-secret` |
| **TTD** | `cesteral-ttd-partner-id`, `cesteral-ttd-api-secret` |
| **LinkedIn** | `cesteral-linkedin-access-token`, `cesteral-linkedin-client-id`, `cesteral-linkedin-client-secret`, `cesteral-linkedin-refresh-token` |
| **TikTok** | `cesteral-tiktok-access-token`, `cesteral-tiktok-advertiser-id`, `cesteral-tiktok-app-id`, `cesteral-tiktok-app-secret`, `cesteral-tiktok-refresh-token` |
| **SA360** | `cesteral-sa360-client-id`, `cesteral-sa360-client-secret`, `cesteral-sa360-refresh-token`, `cesteral-sa360-login-customer-id` |
| **Pinterest** | `cesteral-pinterest-access-token`, `cesteral-pinterest-ad-account-id`, `cesteral-pinterest-app-id`, `cesteral-pinterest-app-secret`, `cesteral-pinterest-refresh-token` |
| **Snapchat** | `cesteral-snapchat-access-token`, `cesteral-snapchat-ad-account-id`, `cesteral-snapchat-org-id`, `cesteral-snapchat-app-id`, `cesteral-snapchat-app-secret`, `cesteral-snapchat-refresh-token` |
| **Amazon DSP** | `cesteral-amazon-dsp-access-token`, `cesteral-amazon-dsp-profile-id`, `cesteral-amazon-dsp-client-id`, `cesteral-amazon-dsp-app-id`, `cesteral-amazon-dsp-app-secret`, `cesteral-amazon-dsp-refresh-token` |
| **Microsoft Ads** | `cesteral-msads-access-token`, `cesteral-msads-developer-token`, `cesteral-msads-customer-id`, `cesteral-msads-account-id` |

</details>

## Step 4: Build & Deploy

```bash
./scripts/deploy.sh <dev|prod> [--skip-build] [--plan-only]
```

**Flags:**

| Flag | Effect |
|------|--------|
| `--skip-build` | Skip Docker build/push, deploy with existing `:latest` images |
| `--plan-only` | Run Terraform plan only — shows what would change without applying |

**What it does:**

1. Builds all 13 server Docker images in parallel (tagged with git SHA + `{env}-latest`)
2. Pushes images to Artifact Registry (`europe-west2-docker.pkg.dev`)
3. Initializes Terraform with the environment backend config
4. Runs `terraform plan` with all 13 image variables
5. **Production only:** Displays the plan and requires manual `yes/no` confirmation
6. Applies Terraform (creates/updates Cloud Run services, networking, monitoring)
7. Runs post-deploy health checks (`/health` endpoint, up to 24 retries × 5s per service)
8. **On health check failure:** Auto-rollback to the previous Cloud Run revision

### Environment Differences

| Setting | Dev | Prod |
|---------|-----|------|
| Min instances | 0 (scale to zero) | 1 (always warm) |
| Max instances | 3 | 10 |
| CPU / Memory | 1 vCPU / 512Mi | 2 vCPU / 1Gi |
| Log level | `debug` | `info` |
| Cloud NAT logging | ALL | ERRORS only |

## Step 5: Verify

```bash
./scripts/smoke-test.sh <dev|prod>
```

**What it checks for each of the 13 servers:**

1. Resolves the Cloud Run service URL via `gcloud`
2. `GET /health` — expects HTTP 200
3. `POST /mcp` with a JSON-RPC `ping` — expects a `"result"` in the response

Outputs `[PASS]`, `[FAIL]`, or `[INFO]` (skipped — not deployed) per server. Exits with code 1 if any server fails.

## CI/CD Alternative

Instead of the manual `deploy.sh` flow, use Cloud Build for automated deployments.

### Automated Pipeline (`cloudbuild.yaml`)

Triggered on Git push. Runs the full pipeline:

1. **Test** — `pnpm install`, `build`, `typecheck`, `test`
2. **Build images** — all 13 servers in parallel
3. **Vulnerability scan** — Trivy (blocks on HIGH/CRITICAL findings)
4. **Push images** — to Artifact Registry
5. **Terraform init → validate → lint → plan → apply**
6. **Health checks** — with auto-rollback on failure

Machine type: `N1_HIGHCPU_8`. Timeout: 40 minutes.

> **Production note:** Add a [Cloud Build approval gate](https://cloud.google.com/build/docs/securing-builds/gate-builds-on-approval) before the `terraform-apply` step for production environments.

### Manual Build Only (`cloudbuild-manual.yaml`)

Builds and pushes images without running Terraform. Useful for iterating on Docker images.

```bash
gcloud builds submit --config=cloudbuild-manual.yaml \
  --substitutions=_ENVIRONMENT=dev
```

Timeout: 15 minutes.

## Credential Architecture

Cesteral uses a 3-tier credential model that keeps MCP servers stateless:

```
┌─────────────────────────────────────────────┐
│  Tier 1: Storage                            │
│  Intelligence KMS (hosted) or               │
│  GCP Secret Manager (self-hosted)           │
└──────────────────┬──────────────────────────┘
                   │ decrypted per-request
┌──────────────────▼──────────────────────────┐
│  Tier 2: Relay                              │
│  HTTP headers (Intelligence mode) or        │
│  env vars (self-hosted mode)                │
└──────────────────┬──────────────────────────┘
                   │ extracted by auth strategy
┌──────────────────▼──────────────────────────┐
│  Tier 3: Usage                              │
│  MCP server auth adapter creates API client │
│  Credentials used for request, then dropped │
└─────────────────────────────────────────────┘
```

Each server has a platform-specific auth strategy (e.g., `MetaBearerAuthStrategy`, `TtdHeadersAuthStrategy`) that extracts credentials from the request and creates a per-session API client. Servers never write credentials to disk or database.

For more on the boundary between OSS servers and Intelligence, see [`docs/architecture/oss-vs-intelligence-boundary.md`](../architecture/oss-vs-intelligence-boundary.md).

## Troubleshooting

### Permission Denied on `gcloud` or `terraform`

- Ensure you've run `gcloud auth login` and `gcloud auth application-default login`
- Verify your account has the required IAM roles on the target project
- For Terraform, check that the `terraform-deployer` service account exists (run `init-gcp-project.sh`)

### Terraform State Locked

Another Terraform process is holding the state lock.

```bash
# Check who holds the lock
terraform force-unlock <LOCK_ID>
```

Only force-unlock if you're certain no other process is running. The lock ID is shown in the error message.

### Health Check Failures After Deploy

The deploy script auto-rolls back on health check failure. To investigate:

```bash
# Check Cloud Run logs
gcloud run services logs tail <server-name> --region=europe-west2

# Check the service status
gcloud run services describe <server-name> --region=europe-west2

# Manually test the endpoint
curl -s https://<service-url>/health
curl -s -X POST https://<service-url>/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"ping","id":1}'
```

Common causes: missing secrets, incorrect secret versions, startup crashes (check logs).

### Secret Not Found

```bash
# List all secrets in the project
gcloud secrets list --project=<PROJECT_ID>

# Check if a specific secret has versions
gcloud secrets versions list <SECRET_NAME> --project=<PROJECT_ID>

# Re-run the secret creation script
./scripts/create-secrets.sh <dev|prod>
```

### Docker Build Failures

```bash
# Build a single server locally to debug
docker build --build-arg SERVER_NAME=dv360-mcp -t test-build .

# Or build via pnpm first to catch TypeScript errors
cd packages/<server-name> && pnpm run build
```

### Terraform Plan Shows Unexpected Changes

```bash
# Inspect current state
cd terraform && terraform show

# Refresh state from GCP (read-only)
terraform plan -refresh-only -var-file=<env>.tfvars
```

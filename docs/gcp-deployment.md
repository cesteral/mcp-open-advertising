# GCP Deployment Guide for Campaign Guardian

This guide provides detailed information about deploying and operating the Campaign Guardian MCP Server on Google Cloud Platform.

## Table of Contents

1. [Architecture](#architecture)
2. [GCP Services](#gcp-services)
3. [Networking](#networking)
4. [Security](#security)
5. [Monitoring & Logging](#monitoring--logging)
6. [Scaling & Performance](#scaling--performance)
7. [Cost Optimization](#cost-optimization)
8. [Operations](#operations)

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Google Cloud Platform                    │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │               Cloud Scheduler Jobs                     │ │
│  │  ┌──────────────────┐    ┌──────────────────┐         │ │
│  │  │ Pre-flight Check │    │ In-flight Monitor│         │ │
│  │  │  (OIDC Auth)     │    │   (OIDC Auth)    │         │ │
│  │  └────────┬─────────┘    └────────┬─────────┘         │ │
│  └───────────┼────────────────────────┼───────────────────┘ │
│              │                        │                     │
│              │ POST /trigger          │                     │
│              ▼                        ▼                     │
│  ┌────────────────────────────────────────────────────────┐ │
│  │            Cloud Run Service (MCP Server)              │ │
│  │  ┌──────────────────────────────────────────────────┐  │ │
│  │  │  Container: Node.js 20 (MCP TypeScript Server)   │  │ │
│  │  │  - HTTP Transport (port 8080)                     │  │ │
│  │  │  - JWT Authentication                             │  │ │
│  │  │  - OpenTelemetry instrumentation                  │  │ │
│  │  │  - Stateless (no persistence)                     │  │ │
│  │  └──────────────────────────────────────────────────┘  │ │
│  │                         │                               │ │
│  │      ┌──────────────────┼──────────────────┐           │ │
│  │      │                  │                  │           │ │
│  └──────┼──────────────────┼──────────────────┼───────────┘ │
│         │                  │                  │             │
│         │                  │                  │             │
│  ┌──────▼──────┐  ┌────────▼────────┐ ┌──────▼──────┐     │
│  │   Secret    │  │  VPC Connector  │ │ Cloud       │     │
│  │   Manager   │  │  ┌───────────┐  │ │ Logging/    │     │
│  │             │  │  │ Cloud NAT │  │ │ Monitoring  │     │
│  │ - DV360     │  │  └─────┬─────┘  │ │ - Logs      │     │
│  │ - Teams     │  │        │        │ │ - Metrics   │     │
│  │ - Beam      │  │   VPC Network   │ │ - Traces    │     │
│  │ - JWT       │  └────────┬────────┘ └─────────────┘     │
│  └─────────────┘           │                               │
│                            │ Egress                        │
└────────────────────────────┼───────────────────────────────┘
                             │
                    ┌────────▼────────┐
                    │  External APIs  │
                    ├─────────────────┤
                    │ - DV360 API     │
                    │ - Bid Manager   │
                    │ - Beam/Data-    │
                    │   bridge        │
                    │ - Vertex AI     │
                    └─────────────────┘
```

### Component Responsibilities

| Component | Purpose | Scalability |
|-----------|---------|-------------|
| **Cloud Run** | Hosts MCP server container | 0-10 instances (configurable) |
| **Cloud Scheduler** | Triggers automated checks | Fixed (2 jobs) |
| **VPC Connector** | Private networking for Cloud Run | 2-10 instances (auto-scaled) |
| **Cloud NAT** | Outbound internet access | Auto-scaled |
| **Secret Manager** | Secure credential storage | Managed service |
| **Cloud Logging** | Centralized log aggregation | Managed service |
| **Cloud Monitoring** | Metrics and alerting | Managed service |

## GCP Services

### Cloud Run Configuration

**Service Details:**
- **Name:** `campaign-guardian-mcp`
- **Region:** `europe-west2` (configurable)
- **Platform:** Fully managed
- **Ingress:** Internal and Cloud Load Balancing (authenticated)
- **Egress:** VPC connector (all traffic)

**Container Configuration:**
- **Image:** Node.js 20 slim base
- **Port:** 8080 (HTTP/2)
- **User:** Non-root (UID 1001)
- **Health Check:** `/health` endpoint
- **Startup Probe:** 10s delay, 30s timeout
- **Liveness Probe:** 30s interval, 3s timeout

**Environment Variables:**
```bash
MCP_TRANSPORT_TYPE=http
MCP_SESSION_MODE=stateless
MCP_HTTP_PORT=8080
MCP_HTTP_HOST=0.0.0.0
MCP_AUTH_MODE=jwt
NODE_ENV=production
LOG_LEVEL=info
OTEL_ENABLED=true
GCP_PROJECT_ID=<project-id>

# Secrets (injected from Secret Manager)
MCP_AUTH_SECRET_KEY=<secret>
DV360_OAUTH_CLIENT_ID=<secret>
DV360_OAUTH_CLIENT_SECRET=<secret>
DV360_REFRESH_TOKEN=<secret>
BID_MANAGER_API_KEY=<secret>
BEAM_API_KEY=<secret>
TEAMS_APP_ID=<secret>
TEAMS_APP_SECRET=<secret>
```

**Resource Limits:**

| Environment | CPU | Memory | Min Instances | Max Instances |
|-------------|-----|--------|---------------|---------------|
| **Dev** | 1 | 512Mi | 0 | 3 |
| **Staging** | 1 | 512Mi | 1 | 5 |
| **Prod** | 2 | 1Gi | 1 | 10 |

### Secret Manager

**Secrets Created:**
1. `campaign-guardian-jwt-secret-key` - JWT signing key for MCP auth
2. `campaign-guardian-dv360-oauth-client-id` - DV360 OAuth client ID
3. `campaign-guardian-dv360-oauth-client-secret` - DV360 OAuth client secret
4. `campaign-guardian-dv360-refresh-token` - DV360 OAuth refresh token
5. `campaign-guardian-bid-manager-api-key` - Bid Manager API key
6. `campaign-guardian-beam-api-key` - Beam/Databridge API key
7. `campaign-guardian-teams-app-id` - Teams bot app ID
8. `campaign-guardian-teams-app-secret` - Teams bot app secret

**Access Control:**
- Runtime service account has `secretAccessor` role on all secrets
- Automatic rotation: Not enabled (manual process)
- Versioning: Enabled (stores all versions)

### Cloud Scheduler

**Pre-flight Check Job:**
- **Name:** `campaign-guardian-mcp-preflight`
- **Schedule:** Configurable (default: 6am, 2pm, 10pm daily in prod)
- **Timezone:** America/New_York
- **Target:** `POST /trigger/preflight` on Cloud Run service
- **Auth:** OIDC token (runtime service account)
- **Retry:** 3 attempts, exponential backoff (60s-300s)

**In-flight Monitor Job:**
- **Name:** `campaign-guardian-mcp-inflight`
- **Schedule:** Hourly (configurable)
- **Timezone:** America/New_York
- **Target:** `POST /trigger/inflight` on Cloud Run service
- **Auth:** OIDC token (runtime service account)
- **Retry:** 3 attempts, exponential backoff (30s-180s)

## Networking

### VPC Architecture

**VPC Network:**
- **Name:** `campaign-guardian-vpc`
- **Auto-create subnets:** Disabled (manual subnet control)
- **Routing mode:** Regional

**Serverless Subnet:**
- **Name:** `campaign-guardian-serverless-subnet`
- **CIDR:** `10.8.0.0/28` (16 IPs, minimum for VPC connector)
- **Region:** `europe-west2`
- **Private Google Access:** Enabled

### VPC Access Connector

**Purpose:** Connects Cloud Run to VPC for:
- Private networking (if needed in future)
- Controlled egress via Cloud NAT
- Consistent source IP for API calls

**Configuration:**
- **Machine Type:** `e2-micro` (dev/staging), `e2-micro` (prod)
- **Instances:** 2-3 (dev), 2-4 (staging), 2-10 (prod)
- **Throughput:** 200-300 Mbps (dev), 300-1000 Mbps (prod)

### Cloud NAT

**Purpose:**
- Provides stable outbound IP addresses
- Required for DV360 API allowlisting (if needed)
- Logs all egress traffic for audit

**Configuration:**
- **NAT IP allocation:** Automatic
- **Source:** All subnetworks
- **Ports per VM:** 64 minimum
- **Logging:** Errors only (prod), All (dev)
- **Endpoint independent mapping:** Enabled (prod)

### Firewall Rules

**Egress Rules:**
1. **Allow Google APIs** (199.36.153.0/24)
   - Ports: 443
   - Purpose: Access GCP services (Secret Manager, etc.)

2. **Allow External APIs** (0.0.0.0/0)
   - Ports: 443
   - Purpose: DV360, Bid Manager, Beam, Vertex AI

**Ingress Rules:**
1. **Allow Scheduler** (0.0.0.0/0 - Cloud Scheduler IPs are dynamic)
   - Ports: 8080
   - Purpose: Scheduled job triggers

2. **Allow Health Checks** (35.191.0.0/16, 130.211.0.0/22)
   - All ports
   - Purpose: Google Cloud health checks

## Security

### Authentication & Authorization

**Cloud Run Service:**
- **IAM Authentication:** Required (no unauthenticated access)
- **Invokers:** Runtime service account, Cloud Scheduler

**MCP Server:**
- **JWT Authentication:** Enabled in production
- **Secret Key:** Stored in Secret Manager
- **Token Validation:** On every request

**Service Account Permissions:**

Runtime service account has:
- `roles/secretmanager.secretAccessor` (read secrets)
- `roles/logging.logWriter` (write logs)
- `roles/monitoring.metricWriter` (write metrics)
- `roles/cloudtrace.agent` (write traces)
- `roles/aiplatform.user` (call Vertex AI)
- `roles/run.invoker` (invoke Cloud Run)

### Network Security

- **VPC isolation:** All egress through VPC connector
- **Private subnet:** Serverless subnet not directly accessible
- **NAT gateway:** Single controlled egress point
- **Firewall rules:** Minimal required access only

### Secrets Management

- **At-rest encryption:** Automatic (Google-managed keys)
- **In-transit encryption:** TLS 1.2+ (automatic)
- **Access logging:** Audit logs for secret access
- **Rotation:** Manual (recommended quarterly)

## Monitoring & Logging

### Cloud Logging

**Log Sources:**
- **Cloud Run:** Request logs, application logs, system logs
- **Cloud Scheduler:** Job execution logs
- **VPC Connector:** Connection logs
- **Cloud NAT:** Egress traffic logs (errors only in prod)

**Log Queries:**

View recent Cloud Run logs:
```bash
gcloud logging read \
  'resource.type=cloud_run_revision AND resource.labels.service_name=campaign-guardian-mcp' \
  --limit 50 \
  --format json
```

View errors only:
```bash
gcloud logging read \
  'resource.type=cloud_run_revision AND severity>=ERROR' \
  --limit 20
```

View scheduler job logs:
```bash
gcloud logging read \
  'resource.type=cloud_scheduler_job' \
  --limit 20
```

**Log Retention:**
- **Default:** 30 days (configurable up to 90 days)
- **Recommendation:** 90 days for compliance

### Cloud Monitoring

**Automatic Metrics:**
- **Request count** (total, per route)
- **Request latency** (p50, p95, p99)
- **Error rate** (4xx, 5xx)
- **Instance count** (current active instances)
- **CPU utilization** (per instance)
- **Memory utilization** (per instance)
- **Billable instance time** (for cost tracking)

**Custom Dashboards:**

Create dashboard for Campaign Guardian:
```bash
gcloud monitoring dashboards create \
  --config-from-file=monitoring-dashboard.json
```

**Alerting Policies:**

Recommended alerts:
1. **High error rate** (>5% for 5 minutes)
2. **High latency** (p99 >3s for 5 minutes)
3. **Instance exhaustion** (all instances busy for 2 minutes)
4. **Scheduler job failures** (3 consecutive failures)

### Cloud Trace

**Distributed Tracing:**
- **Automatic:** HTTP requests traced end-to-end
- **Sampling:** 10% of requests (configurable)
- **Custom spans:** OpenTelemetry instrumentation in MCP code

View traces:
```bash
# Via Console
https://console.cloud.google.com/traces/list

# Via gcloud
gcloud alpha trace list-traces
```

## Scaling & Performance

### Auto-scaling Behavior

**Cloud Run Scaling:**
- **Trigger:** CPU utilization, concurrency, request queue
- **Scale-up:** Instantaneous (container start ~2-5s)
- **Scale-down:** 15 minutes of idle time
- **Concurrency:** 80 requests per instance (default)

**VPC Connector Scaling:**
- **Trigger:** Throughput demand
- **Scale-up:** Gradual (new instance ~5 minutes)
- **Scale-down:** 10 minutes of low utilization

### Performance Tuning

**Reduce Cold Starts:**
```hcl
min_instances         = 1              # Keep 1 warm instance
cpu_always_allocated  = true           # Allocate CPU during idle
```

**Increase Concurrency:**
```yaml
# In cloud run service spec
containerConcurrency: 100              # Default: 80
```

**Optimize Container:**
- Multi-stage Docker build (smaller image)
- Minimize dependencies (faster startup)
- Use .dockerignore (faster builds)

### Load Testing

Test with `ab` (Apache Bench):
```bash
ab -n 1000 -c 10 -H "Authorization: Bearer TOKEN" \
  https://SERVICE_URL/health
```

Test with `hey`:
```bash
hey -n 1000 -c 10 -H "Authorization: Bearer TOKEN" \
  https://SERVICE_URL/health
```

## Cost Optimization

### Cost Optimization Tips

**For Non-Production:**
- Set `min_instances = 0` (scale to zero when idle)
- Reduce VPC connector instances to minimum
- Use smaller machine types
- Reduce log retention to 30 days

**For All Environments:**
- Use Cloud Build for CI/CD (cheaper than external CI)
- Clean up old container images (>30 days)
- Use committed use discounts for predictable workloads
- Monitor with cost alerts

## Operations

### Deployment Process

**Via Scripts (Recommended):**
```bash
./scripts/deploy.sh prod
```

**Via Cloud Build:**
```bash
gcloud builds submit \
  --config=cloudbuild.yaml \
  --substitutions=_ENVIRONMENT=prod
```

### Rollback

If deployment fails or has issues:

```bash
# Get previous revision
gcloud run revisions list \
  --service=campaign-guardian-mcp \
  --region=europe-west2

# Route traffic to previous revision
gcloud run services update-traffic campaign-guardian-mcp \
  --to-revisions=REVISION_NAME=100 \
  --region=europe-west2
```

### Health Checks

**Check service health:**
```bash
SERVICE_URL=$(gcloud run services describe campaign-guardian-mcp \
  --region=europe-west2 \
  --format='value(status.url)')

curl -H "Authorization: Bearer $(gcloud auth print-identity-token)" \
  $SERVICE_URL/health
```

### Debugging

**View live logs:**
```bash
gcloud run services logs tail campaign-guardian-mcp \
  --region=europe-west2
```

**SSH into container (for debugging):**
```bash
# Cloud Run doesn't support SSH, but you can run locally:
docker run -it --entrypoint /bin/bash \
  europe-west2-docker.pkg.dev/PROJECT_ID/campaign-guardian/mcp-server:latest
```

### Maintenance

**Update secrets:**
```bash
./scripts/create-secrets.sh prod
# Then redeploy
./scripts/deploy.sh prod
```

**Update scheduler jobs:**
```bash
cd terraform
terraform apply -var-file=prod.tfvars
```

**Scale manually:**
```bash
# Scale to specific instance count
gcloud run services update campaign-guardian-mcp \
  --min-instances=2 \
  --max-instances=20 \
  --region=europe-west2
```

## Next Steps

- [Terraform Setup Guide](./terraform-setup.md) - Infrastructure deployment
- [MCP Server Configuration](../mcp-ts-quickstart-template/README.md) - Server development
- [Scripts README](../scripts/README.md) - Helper scripts

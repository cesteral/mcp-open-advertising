#!/bin/bash

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
print_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }
print_step() { echo -e "${BLUE}[STEP]${NC} $1"; }

if [ -z "${1:-}" ]; then
  print_error "Usage: $0 <environment> [--skip-build] [--plan-only]"
  exit 1
fi

ENVIRONMENT=$1
SKIP_BUILD=false
PLAN_ONLY=false
shift

while [ $# -gt 0 ]; do
  case "$1" in
    --skip-build) SKIP_BUILD=true ;;
    --plan-only) PLAN_ONLY=true ;;
    *)
      print_error "Unknown option: $1"
      exit 1
      ;;
  esac
  shift
done

case "$ENVIRONMENT" in
  dev) PROJECT_ID="${GCP_PROJECT_DEV:?Set GCP_PROJECT_DEV to your dev GCP project ID}" ;;
  prod) PROJECT_ID="${GCP_PROJECT_PROD:?Set GCP_PROJECT_PROD to your prod GCP project ID}" ;;
  *)
    print_error "Invalid environment: $ENVIRONMENT. Must be dev or prod."
    exit 1
    ;;
esac

REGION="europe-west2"
REPO_NAME="cesteral"
GIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "local")
SERVERS=(
  "dbm-mcp"
  "dv360-mcp"
  "ttd-mcp"
  "gads-mcp"
  "meta-mcp"
  "linkedin-mcp"
  "tiktok-mcp"
  "cm360-mcp"
  "sa360-mcp"
  "pinterest-mcp"
  "snapchat-mcp"
  "amazon-dsp-mcp"
  "msads-mcp"
)

print_info "Environment: $ENVIRONMENT"
print_info "Project ID: $PROJECT_ID"
print_info "Servers: ${SERVERS[*]}"

print_step "Setting active GCP project..."
gcloud config set project "$PROJECT_ID"

if [ "$SKIP_BUILD" = false ]; then
  print_step "Configuring Docker for Artifact Registry..."
  gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

  for SERVER in "${SERVERS[@]}"; do
    IMAGE_TAG="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${SERVER}:${GIT_SHA}"
    IMAGE_LATEST="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${SERVER}:latest"
    print_step "Building and pushing ${SERVER}..."
    # --platform linux/amd64 is REQUIRED: Cloud Run runs amd64, and `docker build`
    # defaults to the host arch — on an Apple Silicon (arm64) machine an
    # unqualified build produces arm64 images that fail on Cloud Run with
    # "exec format error". On arm64 hosts this builds under emulation (slower).
    docker build --platform linux/amd64 -t "$IMAGE_TAG" -t "$IMAGE_LATEST" --build-arg "SERVER_NAME=${SERVER}" -f Dockerfile .
    docker push "$IMAGE_TAG"
    docker push "$IMAGE_LATEST"
  done
else
  print_warn "Skipping Docker build"
fi

cd terraform

print_step "Initializing Terraform..."
terraform init -backend-config="backend-${ENVIRONMENT}.conf" -reconfigure

# Image tag: fresh builds deploy the SHA-tagged images pushed above;
# --skip-build pins to whatever :latest currently is in the registry.
IMAGE_TAG_REF="$GIT_SHA"
if [ "$SKIP_BUILD" = true ]; then
  IMAGE_TAG_REF="latest"
fi

TF_ARGS=(
  # Pin the repo name to the one this script (and init-gcp-project.sh)
  # actually pushes to, so a stray tfvars value can't point Cloud Run at
  # images that were never built.
  -var="artifact_registry_repo_name=${REPO_NAME}"
  -var-file="${ENVIRONMENT}.tfvars"
)
for SERVER in "${SERVERS[@]}"; do
  TF_ARGS+=(-var="${SERVER//-/_}_image=${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${SERVER}:${IMAGE_TAG_REF}")
done

# First-apply guard: init-gcp-project.sh creates the Artifact Registry repo
# via gcloud (it must exist before this script can push images), but the repo
# is also declared as a terraform resource. On a fresh state the apply would
# fail with 409 already-exists — import the pre-existing repo once, after
# which terraform owns it (cleanup policies, labels).
if ! terraform state list 2>/dev/null | grep -q '^google_artifact_registry_repository\.container_repo$'; then
  if gcloud artifacts repositories describe "$REPO_NAME" --location="$REGION" --project="$PROJECT_ID" >/dev/null 2>&1; then
    print_step "Importing pre-existing Artifact Registry repo into Terraform state..."
    terraform import "${TF_ARGS[@]}" \
      google_artifact_registry_repository.container_repo \
      "projects/${PROJECT_ID}/locations/${REGION}/repositories/${REPO_NAME}"
  fi
fi

print_step "Running Terraform plan..."
terraform plan "${TF_ARGS[@]}" -out=tfplan

if [ "$PLAN_ONLY" = true ]; then
  print_warn "Plan-only mode: Terraform changes not applied"
  exit 0
fi

if [ "$ENVIRONMENT" = "prod" ]; then
  print_warn "You are about to deploy to PRODUCTION"
  print_step "Reviewing Terraform plan..."
  terraform show tfplan
  echo ""
  read -r -p "Review the plan above. Proceed with apply? (yes/no): " confirm
  if [ "$confirm" != "yes" ]; then
    print_error "Deployment cancelled"
    exit 1
  fi
fi

print_step "Applying Terraform configuration..."
terraform apply tfplan

print_step "Running post-deploy health checks..."
# When allow_unauthenticated=false, Cloud Run IAM rejects bare requests with
# 401/403 before the app answers, so the probe presents the deployer's
# identity token (project owners/run.admins hold run.routes.invoke).
IDENTITY_TOKEN=$(gcloud auth print-identity-token 2>/dev/null || echo "")
FAILED_SERVICES=""
for SERVER in "${SERVERS[@]}"; do
  OUTPUT_NAME="${SERVER//-/_}_service_url"
  SERVER_URL=$(terraform output -raw "$OUTPUT_NAME" 2>/dev/null || echo "")
  if [ -z "$SERVER_URL" ]; then
    print_warn "Could not get URL for $SERVER"
    continue
  fi
  HEALTHY=false
  for i in $(seq 1 24); do
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$SERVER_URL/health")
    if [ "$HTTP_CODE" = "200" ]; then
      print_info "Health check passed for $SERVER"
      HEALTHY=true
      break
    fi
    if { [ "$HTTP_CODE" = "401" ] || [ "$HTTP_CODE" = "403" ]; } && [ -n "$IDENTITY_TOKEN" ]; then
      if curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $IDENTITY_TOKEN" "$SERVER_URL/health" | grep -q "200"; then
        print_info "Health check passed for $SERVER (authenticated — service requires Cloud Run IAM)"
        HEALTHY=true
        break
      fi
    fi
    sleep 5
  done
  if [ "$HEALTHY" != "true" ]; then
    print_error "Health check failed for $SERVER"
    FAILED_SERVICES="$FAILED_SERVICES $SERVER"
    PREV_REVISION=$(gcloud run revisions list \
      --service="$SERVER" \
      --region="$REGION" \
      --sort-by='~creationTimestamp' \
      --format='value(metadata.name)' \
      --limit=2 | tail -n1)
    if [ -n "$PREV_REVISION" ]; then
      gcloud run services update-traffic "$SERVER" \
        --region="$REGION" \
        --to-revisions="${PREV_REVISION}=100"
    fi
  fi
done

if [ -n "$FAILED_SERVICES" ]; then
  print_error "Deployment failed. Rolled back:$FAILED_SERVICES"
  exit 1
fi

print_info "Deployment complete"
terraform output deployment_info

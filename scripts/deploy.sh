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
  dev) PROJECT_ID="open-agentic-advertising-dev" ;;
  prod) PROJECT_ID="open-agentic-advertising-prod" ;;
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
    docker build -t "$IMAGE_TAG" -t "$IMAGE_LATEST" --build-arg "SERVER_NAME=${SERVER}" -f Dockerfile .
    docker push "$IMAGE_TAG"
    docker push "$IMAGE_LATEST"
  done
else
  print_warn "Skipping Docker build"
fi

cd terraform

print_step "Initializing Terraform..."
terraform init -backend-config="backend-${ENVIRONMENT}.conf" -reconfigure

TF_ARGS=(
  -var="dbm_mcp_image=${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/dbm-mcp:${GIT_SHA}"
  -var="dv360_mcp_image=${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/dv360-mcp:${GIT_SHA}"
  -var="ttd_mcp_image=${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/ttd-mcp:${GIT_SHA}"
  -var="gads_mcp_image=${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/gads-mcp:${GIT_SHA}"
  -var="meta_mcp_image=${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/meta-mcp:${GIT_SHA}"
  -var="linkedin_mcp_image=${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/linkedin-mcp:${GIT_SHA}"
  -var="tiktok_mcp_image=${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/tiktok-mcp:${GIT_SHA}"
  -var="cm360_mcp_image=${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/cm360-mcp:${GIT_SHA}"
  -var="sa360_mcp_image=${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/sa360-mcp:${GIT_SHA}"
  -var="pinterest_mcp_image=${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/pinterest-mcp:${GIT_SHA}"
  -var="snapchat_mcp_image=${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/snapchat-mcp:${GIT_SHA}"
  -var="amazon_dsp_mcp_image=${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/amazon-dsp-mcp:${GIT_SHA}"
  -var="msads_mcp_image=${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/msads-mcp:${GIT_SHA}"
  -var-file="${ENVIRONMENT}.tfvars"
)

if [ "$SKIP_BUILD" = true ]; then
  TF_ARGS=(
    -var="dbm_mcp_image=${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/dbm-mcp:latest"
    -var="dv360_mcp_image=${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/dv360-mcp:latest"
    -var="ttd_mcp_image=${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/ttd-mcp:latest"
    -var="gads_mcp_image=${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/gads-mcp:latest"
    -var="meta_mcp_image=${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/meta-mcp:latest"
    -var="linkedin_mcp_image=${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/linkedin-mcp:latest"
    -var="tiktok_mcp_image=${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/tiktok-mcp:latest"
    -var="cm360_mcp_image=${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/cm360-mcp:latest"
    -var="sa360_mcp_image=${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/sa360-mcp:latest"
    -var="pinterest_mcp_image=${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/pinterest-mcp:latest"
    -var="snapchat_mcp_image=${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/snapchat-mcp:latest"
    -var="amazon_dsp_mcp_image=${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/amazon-dsp-mcp:latest"
    -var="msads_mcp_image=${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/msads-mcp:latest"
    -var-file="${ENVIRONMENT}.tfvars"
  )
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
    if curl -s -o /dev/null -w "%{http_code}" "$SERVER_URL/health" | grep -q "200"; then
      print_info "Health check passed for $SERVER"
      HEALTHY=true
      break
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

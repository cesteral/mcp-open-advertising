#!/bin/bash
# Deploy Cesteral MCP Servers using Terraform
# This script builds Docker images for all 5 servers, pushes them, and deploys via Terraform

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# Check if environment is provided
if [ -z "$1" ]; then
    print_error "Usage: $0 <environment> [--skip-build] [--plan-only]"
    print_info "Example: $0 dev"
    print_info "  --skip-build: Skip Docker build and push"
    print_info "  --plan-only: Only run terraform plan, don't apply"
    exit 1
fi

ENVIRONMENT=$1
SKIP_BUILD=false
PLAN_ONLY=false

# Parse optional flags
shift
while [ $# -gt 0 ]; do
    case "$1" in
        --skip-build)
            SKIP_BUILD=true
            ;;
        --plan-only)
            PLAN_ONLY=true
            ;;
        *)
            print_error "Unknown option: $1"
            exit 1
            ;;
    esac
    shift
done

# Set project ID based on environment
case $ENVIRONMENT in
    dev)
        PROJECT_ID="cesteral-dev"
        ;;
    prod)
        PROJECT_ID="cesteral-prod"
        ;;
    *)
        print_error "Invalid environment: $ENVIRONMENT. Must be dev or prod."
        exit 1
        ;;
esac

REGION="europe-west2"
REPO_NAME="cesteral"
GIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "local")
SERVERS=("dbm-mcp" "dv360-mcp" "ttd-mcp" "gads-mcp" "meta-mcp")

print_info "=========================================="
print_info "Deploying Cesteral MCP Servers"
print_info "=========================================="
print_info "Environment: $ENVIRONMENT"
print_info "Project ID: $PROJECT_ID"
print_info "Region: $REGION"
print_info "Servers: ${SERVERS[*]}"
print_info "Git SHA: $GIT_SHA"
print_info "=========================================="
print_info ""

# Set active project
print_step "Setting active GCP project..."
gcloud config set project $PROJECT_ID

# Build and push Docker images (unless skipped)
if [ "$SKIP_BUILD" = false ]; then
    print_step "Configuring Docker for Artifact Registry..."
    gcloud auth configure-docker ${REGION}-docker.pkg.dev --quiet

    for SERVER in "${SERVERS[@]}"; do
        IMAGE_TAG="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${SERVER}:${GIT_SHA}"
        IMAGE_LATEST="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${SERVER}:latest"

        print_step "Building Docker image for ${SERVER}..."
        docker build -t $IMAGE_TAG -t $IMAGE_LATEST --build-arg SERVER_NAME=$SERVER -f Dockerfile .

        print_step "Pushing Docker image for ${SERVER}..."
        docker push $IMAGE_TAG
        docker push $IMAGE_LATEST
    done

    print_info "All Docker images pushed successfully!"
else
    print_warn "Skipping Docker build (--skip-build flag set)"
fi

# Navigate to terraform directory
cd terraform

# Initialize Terraform
print_step "Initializing Terraform..."
terraform init -backend-config=backend-${ENVIRONMENT}.conf -reconfigure

# Build image var flags
DBM_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/dbm-mcp:${GIT_SHA}"
DV360_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/dv360-mcp:${GIT_SHA}"
TTD_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/ttd-mcp:${GIT_SHA}"
GADS_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/gads-mcp:${GIT_SHA}"
META_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/meta-mcp:${GIT_SHA}"

if [ "$SKIP_BUILD" = true ]; then
    DBM_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/dbm-mcp:latest"
    DV360_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/dv360-mcp:latest"
    TTD_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/ttd-mcp:latest"
    GADS_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/gads-mcp:latest"
    META_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/meta-mcp:latest"
fi

# Run Terraform plan
print_step "Running Terraform plan..."
terraform plan \
    -var="dbm_mcp_image=${DBM_IMAGE}" \
    -var="dv360_mcp_image=${DV360_IMAGE}" \
    -var="ttd_mcp_image=${TTD_IMAGE}" \
    -var="gads_mcp_image=${GADS_IMAGE}" \
    -var="meta_mcp_image=${META_IMAGE}" \
    -var-file=${ENVIRONMENT}.tfvars \
    -out=tfplan

# Apply Terraform (unless plan-only)
if [ "$PLAN_ONLY" = false ]; then
    print_step "Applying Terraform configuration..."

    # Ask for confirmation in prod
    if [ "$ENVIRONMENT" = "prod" ]; then
        print_warn "You are about to deploy to PRODUCTION!"
        read -p "Are you sure you want to continue? (yes/no): " confirm
        if [ "$confirm" != "yes" ]; then
            print_error "Deployment cancelled"
            exit 1
        fi

        # Show plan output for secondary review
        print_step "Reviewing Terraform plan before apply..."
        terraform show tfplan
        print_warn "Please review the plan output above."
        read -p "Proceed with apply? (yes/no): " confirm_apply
        if [ "$confirm_apply" != "yes" ]; then
            print_error "Deployment cancelled after plan review"
            exit 1
        fi
    fi

    terraform apply tfplan

    # Post-deploy health checks with rollback
    print_step "Running post-deploy health checks..."
    FAILED_SERVICES=""
    for SERVER in "${SERVERS[@]}"; do
        SERVER_URL=$(terraform output -raw ${SERVER//-/_}_mcp_service_url 2>/dev/null || echo "")
        if [ -z "$SERVER_URL" ]; then
            print_warn "Could not get URL for $SERVER, skipping health check"
            continue
        fi
        HEALTHY=false
        for i in $(seq 1 24); do
            if curl -s -o /dev/null -w "%{http_code}" "$SERVER_URL/health" | grep -q "200"; then
                print_info "Health check passed for $SERVER"
                HEALTHY=true
                break
            fi
            echo "Waiting for $SERVER to be ready... (attempt $i/24)"
            sleep 5
        done
        if [ "$HEALTHY" != "true" ]; then
            print_error "Health check FAILED for $SERVER"
            FAILED_SERVICES="$FAILED_SERVICES $SERVER"
            # Rollback: route traffic to previous revision
            PREV_REVISION=$(gcloud run revisions list \
                --service=$SERVER \
                --region=$REGION \
                --sort-by='~creationTimestamp' \
                --format='value(metadata.name)' \
                --limit=2 | tail -n1)
            if [ -n "$PREV_REVISION" ]; then
                print_warn "Rolling back $SERVER to revision: $PREV_REVISION"
                gcloud run services update-traffic $SERVER \
                    --region=$REGION \
                    --to-revisions=$PREV_REVISION=100
            fi
        fi
    done
    if [ -n "$FAILED_SERVICES" ]; then
        print_error "Deployment FAILED — rolled back:$FAILED_SERVICES"
        exit 1
    fi
    print_info "All health checks passed!"

    # Get outputs
    print_step "Retrieving deployment information..."
    DBM_URL=$(terraform output -raw dbm_mcp_service_url 2>/dev/null || echo "N/A")
    DV360_URL=$(terraform output -raw dv360_mcp_service_url 2>/dev/null || echo "N/A")
    TTD_URL=$(terraform output -raw ttd_mcp_service_url 2>/dev/null || echo "N/A")
    GADS_URL=$(terraform output -raw gads_mcp_service_url 2>/dev/null || echo "N/A")
    META_URL=$(terraform output -raw meta_mcp_service_url 2>/dev/null || echo "N/A")

    print_info ""
    print_info "=========================================="
    print_info "Deployment Complete!"
    print_info "=========================================="
    print_info "dbm-mcp URL:   $DBM_URL"
    print_info "dv360-mcp URL: $DV360_URL"
    print_info "ttd-mcp URL:   $TTD_URL"
    print_info "gads-mcp URL:  $GADS_URL"
    print_info "meta-mcp URL:  $META_URL"
    print_info ""
    print_info "Test health endpoints:"
    print_info "  curl $DBM_URL/health"
    print_info "  curl $DV360_URL/health"
    print_info "  curl $TTD_URL/health"
    print_info "  curl $GADS_URL/health"
    print_info "  curl $META_URL/health"
    print_info ""
    print_info "View logs:"
    print_info "  gcloud logging read 'severity>=ERROR AND resource.labels.service_name=~\"(dbm|dv360|ttd|gads|meta)-mcp\"' --limit 50 --project=$PROJECT_ID"
    print_info ""
else
    print_warn "Plan-only mode: Terraform changes not applied"
    print_info "To apply, run: $0 $ENVIRONMENT"
fi

# Clean up
cd ..

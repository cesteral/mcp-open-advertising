#!/bin/bash
# Deploy Campaign Guardian MCP Server using Terraform
# This script builds the Docker image, pushes it, and deploys via Terraform

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
        PROJECT_ID="campaign-guardian-dev" # TODO: Update with actual project ID
        ;;
    staging)
        PROJECT_ID="campaign-guardian-staging" # TODO: Update with actual project ID
        ;;
    prod)
        PROJECT_ID="campaign-guardian-prod" # TODO: Update with actual project ID
        ;;
    *)
        print_error "Invalid environment: $ENVIRONMENT"
        exit 1
        ;;
esac

REGION="europe-west2"
REPO_NAME="campaign-guardian"
IMAGE_NAME="mcp-server"
GIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "local")

IMAGE_TAG="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${IMAGE_NAME}:${GIT_SHA}"
IMAGE_LATEST="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${IMAGE_NAME}:latest"

print_info "=========================================="
print_info "Deploying Campaign Guardian MCP Server"
print_info "=========================================="
print_info "Environment: $ENVIRONMENT"
print_info "Project ID: $PROJECT_ID"
print_info "Region: $REGION"
print_info "Image: $IMAGE_TAG"
print_info "=========================================="
print_info ""

# Set active project
print_step "Setting active GCP project..."
gcloud config set project $PROJECT_ID

# Build and push Docker image (unless skipped)
if [ "$SKIP_BUILD" = false ]; then
    print_step "Building Docker image..."
    docker build -t $IMAGE_TAG -t $IMAGE_LATEST -f Dockerfile .

    print_step "Configuring Docker for Artifact Registry..."
    gcloud auth configure-docker ${REGION}-docker.pkg.dev --quiet

    print_step "Pushing Docker image to Artifact Registry..."
    docker push $IMAGE_TAG
    docker push $IMAGE_LATEST

    print_info "Docker image pushed successfully!"
else
    print_warn "Skipping Docker build (--skip-build flag set)"
    IMAGE_TAG=$IMAGE_LATEST
fi

# Navigate to terraform directory
cd terraform

# Initialize Terraform
print_step "Initializing Terraform..."
terraform init -backend-config=backend-${ENVIRONMENT}.conf -reconfigure

# Run Terraform plan
print_step "Running Terraform plan..."
terraform plan \
    -var="container_image=${IMAGE_TAG}" \
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
    fi

    terraform apply tfplan

    # Get outputs
    print_step "Retrieving deployment information..."
    SERVICE_URL=$(terraform output -raw cloud_run_service_url)
    SERVICE_NAME=$(terraform output -raw cloud_run_service_name)

    print_info ""
    print_info "=========================================="
    print_info "Deployment Complete!"
    print_info "=========================================="
    print_info "Service URL: $SERVICE_URL"
    print_info "Service Name: $SERVICE_NAME"
    print_info ""
    print_info "Test the health endpoint:"
    print_info "  curl $SERVICE_URL/health"
    print_info ""
    print_info "View logs:"
    print_info "  gcloud logging read 'resource.type=cloud_run_revision AND resource.labels.service_name=$SERVICE_NAME' --limit 50 --project=$PROJECT_ID"
    print_info ""
else
    print_warn "Plan-only mode: Terraform changes not applied"
    print_info "To apply, run: $0 $ENVIRONMENT"
fi

# Clean up
cd ..

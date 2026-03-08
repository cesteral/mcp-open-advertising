#!/bin/bash
# Initialize GCP project for Cesteral MCP Servers
# This script sets up the GCP project with required APIs, service accounts, and resources

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if environment is provided
if [ -z "$1" ]; then
    print_error "Usage: $0 <environment>"
    print_info "Example: $0 dev"
    exit 1
fi

ENVIRONMENT=$1
PROJECT_ID="" # Will be set based on environment

# Set project ID based on environment
case $ENVIRONMENT in
    dev)
        PROJECT_ID="cesteral-dev"
        ;;
    prod)
        PROJECT_ID="cesteral-prod"
        ;;
    *)
        print_error "Invalid environment: $ENVIRONMENT"
        print_info "Valid environments: dev, prod"
        exit 1
        ;;
esac

print_info "Initializing GCP project: $PROJECT_ID (environment: $ENVIRONMENT)"

# Set the active project
print_info "Setting active GCP project..."
gcloud config set project $PROJECT_ID

# Enable required APIs
print_info "Enabling required GCP APIs..."
REQUIRED_APIS=(
    "run.googleapis.com"                    # Cloud Run
    "secretmanager.googleapis.com"          # Secret Manager
    "artifactregistry.googleapis.com"       # Artifact Registry
    "compute.googleapis.com"                # Compute Engine (for VPC, NAT)
    "vpcaccess.googleapis.com"              # Serverless VPC Access
    "logging.googleapis.com"                # Cloud Logging
    "monitoring.googleapis.com"             # Cloud Monitoring
    "cloudtrace.googleapis.com"             # Cloud Trace
    "aiplatform.googleapis.com"             # Vertex AI (for Gemini)
    "cloudbuild.googleapis.com"             # Cloud Build
    "storage-api.googleapis.com"            # Cloud Storage
    "iam.googleapis.com"                    # IAM
    "cloudresourcemanager.googleapis.com"   # Resource Manager
)

for api in "${REQUIRED_APIS[@]}"; do
    print_info "  Enabling $api..."
    gcloud services enable $api --project=$PROJECT_ID
done

print_info "All required APIs enabled successfully!"

# Create Artifact Registry repository
print_info "Creating Artifact Registry repository..."
REGION="europe-west2"
REPO_NAME="cesteral"

if gcloud artifacts repositories describe $REPO_NAME \
    --location=$REGION \
    --project=$PROJECT_ID &>/dev/null; then
    print_warn "Artifact Registry repository already exists: $REPO_NAME"
else
    gcloud artifacts repositories create $REPO_NAME \
        --repository-format=docker \
        --location=$REGION \
        --description="Container images for Cesteral MCP Servers" \
        --project=$PROJECT_ID
    print_info "Artifact Registry repository created: $REPO_NAME"
fi

# Create GCS bucket for Terraform state
print_info "Creating GCS bucket for Terraform state..."
STATE_BUCKET="${PROJECT_ID}-terraform-state"

if gsutil ls -b gs://$STATE_BUCKET &>/dev/null; then
    print_warn "Terraform state bucket already exists: $STATE_BUCKET"
else
    gsutil mb -p $PROJECT_ID -l $REGION gs://$STATE_BUCKET

    # Enable versioning
    gsutil versioning set on gs://$STATE_BUCKET

    # Set lifecycle rule to delete old versions after 30 days
    cat > /tmp/lifecycle.json <<EOF
{
  "lifecycle": {
    "rule": [
      {
        "action": {"type": "Delete"},
        "condition": {
          "numNewerVersions": 3,
          "daysSinceNoncurrentTime": 30
        }
      }
    ]
  }
}
EOF
    gsutil lifecycle set /tmp/lifecycle.json gs://$STATE_BUCKET
    rm /tmp/lifecycle.json

    print_info "Terraform state bucket created: $STATE_BUCKET"
fi

# Create service account for Terraform
print_info "Creating Terraform service account..."
TF_SA_NAME="terraform-deployer"
TF_SA_EMAIL="${TF_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

if gcloud iam service-accounts describe $TF_SA_EMAIL --project=$PROJECT_ID &>/dev/null; then
    print_warn "Terraform service account already exists: $TF_SA_EMAIL"
else
    gcloud iam service-accounts create $TF_SA_NAME \
        --display-name="Terraform Deployer Service Account" \
        --description="Service account for Terraform deployments" \
        --project=$PROJECT_ID
    print_info "Terraform service account created: $TF_SA_EMAIL"
fi

# Grant required roles to Terraform service account
print_info "Granting IAM roles to Terraform service account..."
TF_ROLES=(
    "roles/run.admin"
    "roles/iam.serviceAccountAdmin"
    "roles/iam.serviceAccountUser"
    "roles/secretmanager.admin"
    "roles/compute.networkAdmin"
    "roles/vpcaccess.admin"
    "roles/storage.admin"
    "roles/artifactregistry.admin"
    "roles/logging.admin"
    "roles/monitoring.admin"
)

for role in "${TF_ROLES[@]}"; do
    print_info "  Granting $role..."
    gcloud projects add-iam-policy-binding $PROJECT_ID \
        --member="serviceAccount:$TF_SA_EMAIL" \
        --role="$role" \
        --condition=None \
        --quiet
done

print_info "IAM roles granted successfully!"

# Create GCS bucket for build artifacts
print_info "Creating GCS bucket for build artifacts..."
ARTIFACTS_BUCKET="${PROJECT_ID}-build-artifacts"

if gsutil ls -b gs://$ARTIFACTS_BUCKET &>/dev/null; then
    print_warn "Build artifacts bucket already exists: $ARTIFACTS_BUCKET"
else
    gsutil mb -p $PROJECT_ID -l $REGION gs://$ARTIFACTS_BUCKET
    print_info "Build artifacts bucket created: $ARTIFACTS_BUCKET"
fi

# Print summary
print_info ""
print_info "=========================================="
print_info "GCP Project Initialization Complete!"
print_info "=========================================="
print_info ""
print_info "Project ID: $PROJECT_ID"
print_info "Environment: $ENVIRONMENT"
print_info "Region: $REGION"
print_info ""
print_info "Resources created:"
print_info "  - Artifact Registry: $REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME"
print_info "  - Terraform state bucket: gs://$STATE_BUCKET"
print_info "  - Build artifacts bucket: gs://$ARTIFACTS_BUCKET"
print_info "  - Terraform service account: $TF_SA_EMAIL"
print_info ""
print_info "Next steps:"
print_info "  1. Run scripts/create-secrets.sh to set up Secret Manager secrets"
print_info "  2. Update terraform/${ENVIRONMENT}.tfvars with correct project ID"
print_info "  3. Run scripts/deploy.sh $ENVIRONMENT to deploy infrastructure"
print_info ""

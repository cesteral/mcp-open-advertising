#!/bin/bash

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
print_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

if [ -z "${1:-}" ]; then
  print_error "Usage: $0 <environment>"
  exit 1
fi

ENVIRONMENT=$1
case "$ENVIRONMENT" in
  dev) PROJECT_ID="open-agentic-advertising-dev" ;;
  prod) PROJECT_ID="open-agentic-advertising-prod" ;;
  *)
    print_error "Invalid environment: $ENVIRONMENT"
    exit 1
    ;;
esac

REGION="europe-west2"
REPO_NAME="cesteral"
STATE_BUCKET="${PROJECT_ID}-terraform-state"
ARTIFACTS_BUCKET="${PROJECT_ID}-build-artifacts"
TF_SA_NAME="terraform-deployer"
TF_SA_EMAIL="${TF_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

print_info "Initializing GCP project: $PROJECT_ID"
gcloud config set project "$PROJECT_ID"

REQUIRED_APIS=(
  "run.googleapis.com"
  "secretmanager.googleapis.com"
  "artifactregistry.googleapis.com"
  "compute.googleapis.com"
  "vpcaccess.googleapis.com"
  "logging.googleapis.com"
  "monitoring.googleapis.com"
  "cloudtrace.googleapis.com"
  "aiplatform.googleapis.com"
  "cloudbuild.googleapis.com"
  "storage-api.googleapis.com"
  "iam.googleapis.com"
  "cloudresourcemanager.googleapis.com"
)

for api in "${REQUIRED_APIS[@]}"; do
  gcloud services enable "$api" --project="$PROJECT_ID"
done

if ! gcloud artifacts repositories describe "$REPO_NAME" --location="$REGION" --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$REPO_NAME" \
    --repository-format=docker \
    --location="$REGION" \
    --description="Container images for Cesteral MCP Servers" \
    --project="$PROJECT_ID"
fi

if ! gsutil ls -b "gs://${STATE_BUCKET}" >/dev/null 2>&1; then
  gsutil mb -p "$PROJECT_ID" -l "$REGION" "gs://${STATE_BUCKET}"
  gsutil versioning set on "gs://${STATE_BUCKET}"
  gsutil lifecycle set /dev/stdin "gs://${STATE_BUCKET}" <<'LIFECYCLE'
{
  "rule": [
    {
      "action": { "type": "Delete" },
      "condition": { "numNewerVersions": 5, "isLive": false }
    },
    {
      "action": { "type": "Delete" },
      "condition": { "daysSinceNoncurrentTime": 90 }
    }
  ]
}
LIFECYCLE
fi

if ! gsutil ls -b "gs://${ARTIFACTS_BUCKET}" >/dev/null 2>&1; then
  gsutil mb -p "$PROJECT_ID" -l "$REGION" "gs://${ARTIFACTS_BUCKET}"
fi

if ! gcloud iam service-accounts describe "$TF_SA_EMAIL" --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$TF_SA_NAME" \
    --display-name="Terraform Deployer Service Account" \
    --description="Service account for Terraform deployments" \
    --project="$PROJECT_ID"
fi

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
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${TF_SA_EMAIL}" \
    --role="$role" \
    --condition=None \
    --quiet
done

print_info "Initialization complete for $PROJECT_ID"

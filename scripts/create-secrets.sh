#!/bin/bash
# Create and populate Secret Manager secrets for Cesteral
# This script prompts for sensitive values and stores them securely

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
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
        print_error "Invalid environment: $ENVIRONMENT. Must be dev or prod."
        exit 1
        ;;
esac

print_info "Creating secrets for project: $PROJECT_ID (environment: $ENVIRONMENT)"

# Function to create or update a secret
create_or_update_secret() {
    local secret_name=$1
    local secret_description=$2
    local prompt_message=$3
    local is_multiline=${4:-false}

    print_info ""
    print_info "=========================================="
    print_info "Secret: $secret_name"
    print_info "$secret_description"
    print_info "=========================================="

    # Check if secret already exists
    if gcloud secrets describe $secret_name --project=$PROJECT_ID &>/dev/null; then
        print_warn "Secret already exists: $secret_name"
        read -p "Do you want to update it? (y/N): " update_secret
        if [[ ! $update_secret =~ ^[Yy]$ ]]; then
            print_info "Skipping $secret_name"
            return
        fi
    else
        # Create the secret
        gcloud secrets create $secret_name \
            --project=$PROJECT_ID \
            --replication-policy="automatic" \
            --labels="environment=$ENVIRONMENT,application=cesteral"
        print_info "Created secret: $secret_name"
    fi

    # Prompt for secret value
    if [ "$is_multiline" = true ]; then
        print_info "$prompt_message"
        print_info "(Press Ctrl+D when done, or paste JSON and press Enter twice)"
        secret_value=$(cat)
    else
        read -sp "$prompt_message: " secret_value
        echo ""
    fi

    # Add secret version
    if [ -n "$secret_value" ]; then
        echo -n "$secret_value" | gcloud secrets versions add $secret_name \
            --project=$PROJECT_ID \
            --data-file=-
        print_info "Added secret version to: $secret_name"
    else
        print_warn "No value provided, skipping version creation"
    fi
}

# JWT Secret Key
create_or_update_secret \
    "cesteral-jwt-secret-key" \
    "JWT secret key for MCP server authentication" \
    "Enter JWT secret key (generate with: openssl rand -base64 32)" \
    false

# DV360 OAuth credentials
create_or_update_secret \
    "cesteral-dv360-oauth-client-id" \
    "DV360 OAuth 2.0 Client ID" \
    "Enter DV360 OAuth Client ID" \
    false

create_or_update_secret \
    "cesteral-dv360-oauth-client-secret" \
    "DV360 OAuth 2.0 Client Secret" \
    "Enter DV360 OAuth Client Secret" \
    false

create_or_update_secret \
    "cesteral-dv360-refresh-token" \
    "DV360 OAuth 2.0 Refresh Token" \
    "Enter DV360 OAuth Refresh Token" \
    false

# Bid Manager API Key
create_or_update_secret \
    "cesteral-bid-manager-api-key" \
    "Bid Manager API Key" \
    "Enter Bid Manager API Key" \
    false

# Beam/Databridge API Key
create_or_update_secret \
    "cesteral-beam-api-key" \
    "Beam/Databridge API Key" \
    "Enter Beam/Databridge API Key" \
    false

# TTD API credentials
create_or_update_secret \
    "cesteral-ttd-partner-id" \
    "The Trade Desk Partner ID" \
    "Enter TTD Partner ID" \
    false

create_or_update_secret \
    "cesteral-ttd-api-secret" \
    "The Trade Desk API Secret" \
    "Enter TTD API Secret" \
    false

# Google Ads credentials
create_or_update_secret \
    "cesteral-gads-developer-token" \
    "Google Ads Developer Token" \
    "Enter Google Ads Developer Token" \
    false

create_or_update_secret \
    "cesteral-gads-client-id" \
    "Google Ads OAuth 2.0 Client ID" \
    "Enter Google Ads OAuth Client ID" \
    false

create_or_update_secret \
    "cesteral-gads-client-secret" \
    "Google Ads OAuth 2.0 Client Secret" \
    "Enter Google Ads OAuth Client Secret" \
    false

create_or_update_secret \
    "cesteral-gads-refresh-token" \
    "Google Ads OAuth 2.0 Refresh Token" \
    "Enter Google Ads OAuth Refresh Token" \
    false

# Print summary
print_info ""
print_info "=========================================="
print_info "Secret Creation Complete!"
print_info "=========================================="
print_info ""
print_info "Secrets created in project: $PROJECT_ID"
print_info ""
print_info "To view secrets:"
print_info "  gcloud secrets list --project=$PROJECT_ID"
print_info ""
print_info "To access a secret:"
print_info "  gcloud secrets versions access latest --secret=SECRET_NAME --project=$PROJECT_ID"
print_info ""
print_info "Next steps:"
print_info "  1. Verify all secrets are created correctly"
print_info "  2. Run scripts/deploy.sh $ENVIRONMENT to deploy infrastructure"
print_info ""

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
  dev) PROJECT_ID="${GCP_PROJECT_DEV:?Set GCP_PROJECT_DEV to your dev GCP project ID}" ;;
  prod) PROJECT_ID="${GCP_PROJECT_PROD:?Set GCP_PROJECT_PROD to your prod GCP project ID}" ;;
  *)
    print_error "Invalid environment: $ENVIRONMENT. Must be dev or prod."
    exit 1
    ;;
esac

create_or_update_secret() {
  local secret_name=$1
  local secret_description=$2
  local prompt_message=$3
  local is_multiline=${4:-false}

  print_info ""
  print_info "Secret: $secret_name"
  print_info "$secret_description"

  if gcloud secrets describe "$secret_name" --project="$PROJECT_ID" >/dev/null 2>&1; then
    print_warn "Secret already exists: $secret_name"
    read -r -p "Update it? (y/N): " update_secret
    if [[ ! $update_secret =~ ^[Yy]$ ]]; then
      return
    fi
  else
    gcloud secrets create "$secret_name" \
      --project="$PROJECT_ID" \
      --replication-policy="automatic" \
      --labels="environment=$ENVIRONMENT,application=cesteral"
  fi

  if [ "$is_multiline" = true ]; then
    print_info "$prompt_message"
    secret_value=$(cat)
  else
    read -r -s -p "$prompt_message: " secret_value
    echo ""
  fi

  if [ -n "$secret_value" ]; then
    echo -n "$secret_value" | gcloud secrets versions add "$secret_name" --project="$PROJECT_ID" --data-file=-
  fi
}

create_or_update_secret "cesteral-jwt-secret-key" "JWT secret key for MCP auth" "Enter JWT secret key"
create_or_update_secret "cesteral-dbm-service-account-json" "DBM service account JSON encoded as base64" "Paste base64-encoded DBM service account JSON" true
create_or_update_secret "cesteral-dv360-service-account-json" "DV360 service account JSON encoded as base64" "Paste base64-encoded DV360 service account JSON" true
create_or_update_secret "cesteral-cm360-service-account-json" "CM360 service account JSON encoded as base64" "Paste base64-encoded CM360 service account JSON" true
create_or_update_secret "cesteral-meta-app-id" "Meta app ID for token introspection/refresh flows" "Enter Meta app ID"
create_or_update_secret "cesteral-meta-app-secret" "Meta app secret for token introspection/refresh flows" "Enter Meta app secret"
create_or_update_secret "cesteral-ttd-partner-id" "The Trade Desk partner ID" "Enter TTD partner ID"
create_or_update_secret "cesteral-ttd-api-secret" "The Trade Desk API secret" "Enter TTD API secret"
create_or_update_secret "cesteral-gads-developer-token" "Google Ads developer token" "Enter Google Ads developer token"
create_or_update_secret "cesteral-gads-client-id" "Google Ads OAuth client ID" "Enter Google Ads client ID"
create_or_update_secret "cesteral-gads-client-secret" "Google Ads OAuth client secret" "Enter Google Ads client secret"
create_or_update_secret "cesteral-gads-refresh-token" "Google Ads refresh token" "Enter Google Ads refresh token"
create_or_update_secret "cesteral-gads-login-customer-id" "Google Ads login customer ID (optional manager account)" "Enter Google Ads login customer ID"
create_or_update_secret "cesteral-meta-access-token" "Meta access token" "Enter Meta access token"
create_or_update_secret "cesteral-linkedin-access-token" "LinkedIn access token" "Enter LinkedIn access token"
create_or_update_secret "cesteral-linkedin-client-id" "LinkedIn client ID for refresh-token flow" "Enter LinkedIn client ID"
create_or_update_secret "cesteral-linkedin-client-secret" "LinkedIn client secret for refresh-token flow" "Enter LinkedIn client secret"
create_or_update_secret "cesteral-linkedin-refresh-token" "LinkedIn refresh token" "Enter LinkedIn refresh token"
create_or_update_secret "cesteral-tiktok-access-token" "TikTok access token" "Enter TikTok access token"
create_or_update_secret "cesteral-tiktok-advertiser-id" "TikTok advertiser ID" "Enter TikTok advertiser ID"
create_or_update_secret "cesteral-tiktok-app-id" "TikTok app ID for refresh-token flow" "Enter TikTok app ID"
create_or_update_secret "cesteral-tiktok-app-secret" "TikTok app secret for refresh-token flow" "Enter TikTok app secret"
create_or_update_secret "cesteral-tiktok-refresh-token" "TikTok refresh token" "Enter TikTok refresh token"
create_or_update_secret "cesteral-sa360-client-id" "SA360 OAuth client ID" "Enter SA360 client ID"
create_or_update_secret "cesteral-sa360-client-secret" "SA360 OAuth client secret" "Enter SA360 client secret"
create_or_update_secret "cesteral-sa360-refresh-token" "SA360 refresh token" "Enter SA360 refresh token"
create_or_update_secret "cesteral-sa360-login-customer-id" "SA360 login customer ID (optional manager account)" "Enter SA360 login customer ID"
create_or_update_secret "cesteral-pinterest-access-token" "Pinterest access token" "Enter Pinterest access token"
create_or_update_secret "cesteral-pinterest-ad-account-id" "Pinterest ad account ID" "Enter Pinterest ad account ID"
create_or_update_secret "cesteral-pinterest-app-id" "Pinterest app ID for refresh-token flow" "Enter Pinterest app ID"
create_or_update_secret "cesteral-pinterest-app-secret" "Pinterest app secret for refresh-token flow" "Enter Pinterest app secret"
create_or_update_secret "cesteral-pinterest-refresh-token" "Pinterest refresh token" "Enter Pinterest refresh token"
create_or_update_secret "cesteral-snapchat-access-token" "Snapchat access token" "Enter Snapchat access token"
create_or_update_secret "cesteral-snapchat-ad-account-id" "Snapchat ad account ID" "Enter Snapchat ad account ID"
create_or_update_secret "cesteral-snapchat-org-id" "Snapchat organization ID" "Enter Snapchat organization ID"
create_or_update_secret "cesteral-snapchat-app-id" "Snapchat app ID for refresh-token flow" "Enter Snapchat app ID"
create_or_update_secret "cesteral-snapchat-app-secret" "Snapchat app secret for refresh-token flow" "Enter Snapchat app secret"
create_or_update_secret "cesteral-snapchat-refresh-token" "Snapchat refresh token" "Enter Snapchat refresh token"
create_or_update_secret "cesteral-amazon-dsp-access-token" "Amazon DSP access token" "Enter Amazon DSP access token"
create_or_update_secret "cesteral-amazon-dsp-profile-id" "Amazon DSP profile ID" "Enter Amazon DSP profile ID"
create_or_update_secret "cesteral-amazon-dsp-client-id" "Amazon DSP client ID" "Enter Amazon DSP client ID"
create_or_update_secret "cesteral-amazon-dsp-app-id" "Amazon DSP app ID for refresh-token flow" "Enter Amazon DSP app ID"
create_or_update_secret "cesteral-amazon-dsp-app-secret" "Amazon DSP app secret for refresh-token flow" "Enter Amazon DSP app secret"
create_or_update_secret "cesteral-amazon-dsp-refresh-token" "Amazon DSP refresh token" "Enter Amazon DSP refresh token"
create_or_update_secret "cesteral-msads-access-token" "Microsoft Ads access token" "Enter Microsoft Ads access token"
create_or_update_secret "cesteral-msads-developer-token" "Microsoft Ads developer token" "Enter Microsoft Ads developer token"
create_or_update_secret "cesteral-msads-customer-id" "Microsoft Ads customer ID" "Enter Microsoft Ads customer ID"
create_or_update_secret "cesteral-msads-account-id" "Microsoft Ads account ID" "Enter Microsoft Ads account ID"

print_info "Secret creation complete for $PROJECT_ID"

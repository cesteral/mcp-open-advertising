#!/bin/bash

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_pass() { echo -e "${GREEN}[PASS]${NC} $1"; }
print_fail() { echo -e "${RED}[FAIL]${NC} $1"; }
print_info() { echo -e "${YELLOW}[INFO]${NC} $1"; }

ENVIRONMENT=${1:-dev}
REGION="europe-west2"

case "$ENVIRONMENT" in
  dev) PROJECT_ID="${GCP_PROJECT_DEV:?Set GCP_PROJECT_DEV to your dev GCP project ID}" ;;
  prod) PROJECT_ID="${GCP_PROJECT_PROD:?Set GCP_PROJECT_PROD to your prod GCP project ID}" ;;
  *)
    echo "Usage: $0 <dev|prod>"
    exit 1
    ;;
esac

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

FAILED=0
PASSED=0
SKIPPED=0

for SERVER in "${SERVERS[@]}"; do
  URL=$(gcloud run services describe "$SERVER" \
    --region="$REGION" \
    --project="$PROJECT_ID" \
    --format='value(status.url)' 2>/dev/null || echo "")

  if [ -z "$URL" ]; then
    print_info "$SERVER — not deployed, skipping"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  # Health check
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$URL/health" 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" != "200" ]; then
    print_fail "$SERVER — /health returned $HTTP_CODE"
    FAILED=$((FAILED + 1))
    continue
  fi

  # MCP ping
  PING_RESPONSE=$(curl -s -X POST "$URL/mcp" \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","method":"ping","id":1}' 2>/dev/null || echo "")

  if echo "$PING_RESPONSE" | grep -q '"result"'; then
    print_pass "$SERVER — health OK, MCP ping OK"
    PASSED=$((PASSED + 1))
  else
    print_fail "$SERVER — health OK but MCP ping failed"
    FAILED=$((FAILED + 1))
  fi
done

echo ""
print_info "Results: $PASSED passed, $FAILED failed, $SKIPPED skipped"

if [ "$FAILED" -gt 0 ]; then
  exit 1
fi

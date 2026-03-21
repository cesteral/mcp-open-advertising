#!/usr/bin/env bash
# Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
# Publishes all Cesteral MCP packages to npm and the official MCP Registry.
#
# Usage:
#   ./scripts/publish-all.sh              # Publish everything (npm + MCP Registry)
#   ./scripts/publish-all.sh --npm-only   # Publish to npm only
#   ./scripts/publish-all.sh --dry-run    # Show what would be published without doing it

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

DRY_RUN=false
NPM_ONLY=false

for arg in "$@"; do
  case "$arg" in
    --dry-run)  DRY_RUN=true ;;
    --npm-only) NPM_ONLY=true ;;
    --help|-h)
      echo "Usage: $0 [--dry-run] [--npm-only]"
      echo "  --dry-run   Show what would be published without doing it"
      echo "  --npm-only  Skip MCP Registry publishing"
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg"
      exit 1
      ;;
  esac
done

SERVERS=(
  dbm-mcp
  dv360-mcp
  ttd-mcp
  gads-mcp
  meta-mcp
  linkedin-mcp
  tiktok-mcp
  cm360-mcp
  sa360-mcp
  pinterest-mcp
  snapchat-mcp
  amazon-dsp-mcp
  msads-mcp
)

log() { echo "==> $*"; }
err() { echo "ERROR: $*" >&2; exit 1; }

# --- Pre-flight checks ---
log "Running pre-flight checks..."

command -v npm >/dev/null 2>&1 || err "npm is not installed"
npm whoami >/dev/null 2>&1 || err "Not logged in to npm. Run: npm login"

if [ "$NPM_ONLY" = false ] && [ "$DRY_RUN" = false ]; then
  command -v mcp-publisher >/dev/null 2>&1 || err "mcp-publisher is not installed. Run: brew install mcp-publisher"
fi

# --- Build ---
log "Building all packages..."
if [ "$DRY_RUN" = true ]; then
  echo "  (dry-run) pnpm run build"
else
  pnpm run build
fi

# --- Publish @cesteral/shared first ---
log "Publishing @cesteral/shared to npm..."
if [ "$DRY_RUN" = true ]; then
  echo "  (dry-run) cd packages/shared && npm publish --access public"
else
  (cd packages/shared && npm publish --access public) || {
    # 403 means already published at this version — not a fatal error
    echo "  Warning: @cesteral/shared publish returned non-zero (may already be published at this version)"
  }
fi

# --- Publish each server to npm ---
for server in "${SERVERS[@]}"; do
  log "Publishing @cesteral/$server to npm..."
  if [ "$DRY_RUN" = true ]; then
    echo "  (dry-run) cd packages/$server && npm publish --access public"
  else
    (cd "packages/$server" && npm publish --access public) || {
      echo "  Warning: @cesteral/$server publish returned non-zero (may already be published at this version)"
    }
  fi
done

# --- Publish to MCP Registry ---
if [ "$NPM_ONLY" = true ]; then
  log "Skipping MCP Registry publishing (--npm-only)"
else
  log "Publishing to MCP Registry..."
  for server in "${SERVERS[@]}"; do
    log "  Publishing $server to MCP Registry..."
    if [ "$DRY_RUN" = true ]; then
      echo "  (dry-run) cd packages/$server && mcp-publisher publish"
    else
      (cd "packages/$server" && mcp-publisher publish) || {
        echo "  Warning: MCP Registry publish for $server returned non-zero"
      }
    fi
  done
fi

log "Done! All packages published."

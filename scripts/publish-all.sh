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

command -v pnpm >/dev/null 2>&1 || err "pnpm is not installed"
command -v npm >/dev/null 2>&1 || err "npm is not installed (required for whoami check)"
command -v node >/dev/null 2>&1 || err "node is not installed (required for tarball inspection)"
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

# --- Pack-and-inspect preflight ---
# Catches the two things that have bitten first publishes in practice:
#  1. workspace:* deps surviving into the published tarball (pnpm publish
#     rewrites them, but if anyone swaps the publisher tool back to npm or
#     forgets a flag, this gate fails loudly).
#  2. LICENSE.md missing from the tarball even though `files` claims it ships.
# Delegates per-tarball validation to scripts/inspect-tarball.mjs which exits
# non-zero on failure; we check exit status explicitly so a broken inspector
# can never silently pass.
log "Inspecting tarball contents (pack + verify)..."
PACK_TMP="$(mktemp -d)"
trap 'rm -rf "$PACK_TMP"' EXIT
PACK_OK=true

inspect_package() {
  local pkg_dir="$1"

  # pnpm pack writes a single .tgz into the destination directory. We capture
  # its path from the last line of pnpm's stdout (pnpm prints the absolute
  # path of the tarball it just produced).
  local tarball
  tarball="$(cd "$pkg_dir" && pnpm pack --pack-destination "$PACK_TMP" 2>/dev/null | tail -n1)"
  if [ ! -f "$tarball" ]; then
    echo "  FAIL $pkg_dir: pack produced no tarball" >&2
    PACK_OK=false
    return
  fi

  if ! node "$REPO_ROOT/scripts/inspect-tarball.mjs" "$tarball"; then
    PACK_OK=false
  fi
}

inspect_package "packages/shared"
for server in "${SERVERS[@]}"; do
  inspect_package "packages/$server"
done

if [ "$PACK_OK" = false ]; then
  err "Tarball inspection failed. Refusing to publish — fix the issues above and re-run."
fi
log "  OK — all tarballs have resolved deps and LICENSE.md."

# --- Publish @cesteral/shared first ---
# pnpm publish (not npm publish) rewrites workspace:* deps to the actual
# resolved version of the workspace package at publish time. npm publish does
# not — it ships the literal "workspace:*" string and breaks consumers.
log "Publishing @cesteral/shared to npm..."
if [ "$DRY_RUN" = true ]; then
  echo "  (dry-run) cd packages/shared && pnpm publish --access public --no-git-checks"
else
  (cd packages/shared && pnpm publish --access public --no-git-checks) || {
    # 403 means already published at this version — not a fatal error
    echo "  Warning: @cesteral/shared publish returned non-zero (may already be published at this version)"
  }
fi

# --- Publish each server to npm ---
for server in "${SERVERS[@]}"; do
  log "Publishing @cesteral/$server to npm..."
  if [ "$DRY_RUN" = true ]; then
    echo "  (dry-run) cd packages/$server && pnpm publish --access public --no-git-checks"
  else
    (cd "packages/$server" && pnpm publish --access public --no-git-checks) || {
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

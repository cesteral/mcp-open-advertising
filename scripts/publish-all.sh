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

# --- npm publish helper ---
# Wraps `pnpm publish` so we can distinguish a tolerable "version already
# published" 403 from every other failure mode (auth, OTP, network, cache
# permission, schema validation, etc.). Previous versions of this script
# downgraded ANY non-zero exit to a warning, which meant a totally failed
# publish could still print "Done!" and exit 0. Now: anything that isn't a
# positively-identified "already published" error gets recorded as a hard
# failure and aborts the run after the loop completes.
#
# pnpm publish proxies npm publish, which returns this body on republish:
#   "You cannot publish over the previously published versions: X.Y.Z."
# Older npm versions returned the code EPUBLISHCONFLICT for the same case.
# Matching either string is the safe positive-identification.
NPM_PUBLISH_FAILURES=()

publish_to_npm() {
  local pkg_dir="$1"
  local pkg_label="$2"

  if [ "$DRY_RUN" = true ]; then
    echo "  (dry-run) cd $pkg_dir && pnpm publish --access public --no-git-checks"
    return 0
  fi

  local out exit_code
  set +e
  out=$(cd "$pkg_dir" && pnpm publish --access public --no-git-checks 2>&1)
  exit_code=$?
  set -e

  echo "$out"

  if [ "$exit_code" -eq 0 ]; then
    return 0
  fi

  if echo "$out" | grep -qE 'cannot publish over the previously published|EPUBLISHCONFLICT'; then
    log "  Note: $pkg_label already published at this version — continuing."
    return 0
  fi

  echo "  FAIL $pkg_label: pnpm publish exited $exit_code (not an 'already published' error)" >&2
  NPM_PUBLISH_FAILURES+=("$pkg_label")
  return 0  # don't abort the loop; we report all failures at the end
}

# --- Publish @cesteral/shared first ---
# pnpm publish (not npm publish) rewrites workspace:* deps to the actual
# resolved version of the workspace package at publish time. npm publish does
# not — it ships the literal "workspace:*" string and breaks consumers.
log "Publishing @cesteral/shared to npm..."
publish_to_npm "packages/shared" "@cesteral/shared"

# --- Publish each server to npm ---
for server in "${SERVERS[@]}"; do
  log "Publishing @cesteral/$server to npm..."
  publish_to_npm "packages/$server" "@cesteral/$server"
done

if [ "${#NPM_PUBLISH_FAILURES[@]}" -gt 0 ]; then
  echo "" >&2
  echo "npm publish failed for ${#NPM_PUBLISH_FAILURES[@]} package(s):" >&2
  for f in "${NPM_PUBLISH_FAILURES[@]}"; do echo "  - $f" >&2; done
  err "Aborting before MCP Registry step. Re-run after fixing the failures above."
fi

# --- Publish to MCP Registry ---
# mcp-publisher resolves the npm tarball during publish, so we only reach
# this step once every npm publish above either succeeded or was tolerable.
MCP_REGISTRY_FAILURES=()

if [ "$NPM_ONLY" = true ]; then
  log "Skipping MCP Registry publishing (--npm-only)"
else
  log "Publishing to MCP Registry..."
  for server in "${SERVERS[@]}"; do
    log "  Publishing $server to MCP Registry..."
    if [ "$DRY_RUN" = true ]; then
      echo "  (dry-run) cd packages/$server && mcp-publisher publish"
    else
      set +e
      (cd "packages/$server" && mcp-publisher publish)
      mcp_exit=$?
      set -e
      if [ "$mcp_exit" -ne 0 ]; then
        echo "  FAIL @cesteral/$server: mcp-publisher exited $mcp_exit" >&2
        MCP_REGISTRY_FAILURES+=("@cesteral/$server")
      fi
    fi
  done
fi

if [ "${#MCP_REGISTRY_FAILURES[@]}" -gt 0 ]; then
  echo "" >&2
  echo "MCP Registry publish failed for ${#MCP_REGISTRY_FAILURES[@]} package(s):" >&2
  for f in "${MCP_REGISTRY_FAILURES[@]}"; do echo "  - $f" >&2; done
  err "Run mcp-publisher publish manually in the affected package(s) to inspect the error."
fi

log "Done! All packages published."

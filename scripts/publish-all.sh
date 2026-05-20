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
PROVENANCE=false

for arg in "$@"; do
  case "$arg" in
    --dry-run)    DRY_RUN=true ;;
    --npm-only)   NPM_ONLY=true ;;
    --provenance) PROVENANCE=true ;;
    --help|-h)
      echo "Usage: $0 [--dry-run] [--npm-only] [--provenance]"
      echo "  --dry-run     Show what would be published without doing it"
      echo "  --npm-only    Skip MCP Registry publishing"
      echo "  --provenance  Publish npm packages with build provenance attestation"
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

# --- Generate attestation manifests ---
# Writes dist/cesteral-manifest.json into each governed package so it ships
# inside the tarball. Runs after build, before pack-and-inspect.
log "Generating attestation manifests..."
if [ "$DRY_RUN" = true ]; then
  echo "  (dry-run) pnpm run generate:manifests"
else
  pnpm run generate:manifests
fi

# --- Pack-and-inspect preflight ---
# Catches the two things that have bitten first publishes in practice:
#  1. workspace:* deps surviving into the published tarball (`pnpm pack`
#     rewrites them, but if anyone swaps the packer tool or forgets a flag,
#     this gate fails loudly).
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
  set +e
  tarball="$(cd "$pkg_dir" && pnpm pack --pack-destination "$PACK_TMP" 2>/dev/null | tail -n1)"
  set -e
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
inspect_package "packages/contract-hash"
for server in "${SERVERS[@]}"; do
  inspect_package "packages/$server"
done

if [ "$PACK_OK" = false ]; then
  err "Tarball inspection failed. Refusing to publish — fix the issues above and re-run."
fi
log "  OK — all tarballs have resolved deps and LICENSE.md."

# --- npm publish helper ---
# Packs each package with `pnpm pack` (which rewrites workspace:* deps into
# the tarball) and publishes the resulting artifact with `npm publish
# <tarball>` so we can pass --provenance — the pinned pnpm 8.15 has no
# provenance support, npm 10.x does.
#
# Wraps the publish so we can distinguish a tolerable "version already
# published" 403 from every other failure mode (auth, OTP, network, cache
# permission, schema validation, etc.). Previous versions of this script
# downgraded ANY non-zero exit to a warning, which meant a totally failed
# publish could still print "Done!" and exit 0. Now: anything that isn't a
# positively-identified "already published" error gets recorded as a hard
# failure and aborts the run after the loop completes.
#
# npm publish returns this body on republish:
#   "You cannot publish over the previously published versions: X.Y.Z."
# Older npm versions returned the code EPUBLISHCONFLICT for the same case.
# Matching either string is the safe positive-identification.
NPM_PUBLISH_FAILURES=()

publish_to_npm() {
  local pkg_dir="$1"
  local pkg_label="$2"

  local prov_flag=""
  if [ "$PROVENANCE" = true ]; then prov_flag="--provenance"; fi

  if [ "$DRY_RUN" = true ]; then
    echo "  (dry-run) pnpm pack $pkg_dir && npm publish <tarball> --access public $prov_flag"
    return 0
  fi

  # pnpm 8.15 has no provenance support; npm does. `pnpm pack` rewrites
  # workspace:* deps into the tarball (the literal range would otherwise
  # ship and break consumers); `npm publish <tarball>` publishes that exact
  # artifact and, with --provenance, attaches the build attestation.
  local tarball
  set +e
  tarball="$(cd "$pkg_dir" && pnpm pack --pack-destination "$PACK_TMP" 2>/dev/null | tail -n1)"
  set -e
  if [ ! -f "$tarball" ]; then
    echo "  FAIL $pkg_label: pnpm pack produced no tarball" >&2
    NPM_PUBLISH_FAILURES+=("$pkg_label")
    return 0
  fi

  local out exit_code
  set +e
  out=$(npm publish "$tarball" --access public $prov_flag 2>&1)
  exit_code=$?
  set -e

  echo "$out"

  if [ "$exit_code" -eq 0 ]; then
    return 0
  fi

  # Here-string (not a pipe) so a fast grep cannot SIGPIPE the upstream echo.
  if grep -qE 'cannot publish over the previously published|EPUBLISHCONFLICT' <<<"$out"; then
    log "  Note: $pkg_label already published at this version — continuing."
    return 0
  fi

  echo "  FAIL $pkg_label: npm publish exited $exit_code (not an 'already published' error)" >&2
  NPM_PUBLISH_FAILURES+=("$pkg_label")
  return 0  # don't abort the loop; failures are reported after the loop
}

# --- Publish @cesteral/shared first ---
# `pnpm pack` rewrites workspace:* deps to the actual resolved version of the
# workspace package, so the tarball `npm publish` uploads carries real version
# ranges rather than the literal "workspace:*" string that would break
# consumers.
#
# Abort immediately if shared fails: server tarballs have @cesteral/shared
# rewritten to the resolved version, so publishing them when shared did not
# land would leave the registry in a broken state (servers referencing a
# version of shared that doesn't exist).
log "Publishing @cesteral/shared to npm..."
publish_to_npm "packages/shared" "@cesteral/shared"

if [ "${#NPM_PUBLISH_FAILURES[@]}" -gt 0 ]; then
  echo "" >&2
  echo "@cesteral/shared publish failed; refusing to publish servers that depend on it." >&2
  err "Fix the shared publish failure above and re-run."
fi

# --- Publish @cesteral/contract-hash ---
# A standalone, zero-dependency library consumed by cesteral-intelligence
# governance. No server package depends on it, so a failure here is recorded
# (NPM_PUBLISH_FAILURES) and reported after the server loop rather than
# aborting the server publishes.
log "Publishing @cesteral/contract-hash to npm..."
publish_to_npm "packages/contract-hash" "@cesteral/contract-hash"

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
#
# Like the npm side, a "version already published" response is tolerable, not
# a failure: only servers whose version changed have anything to publish, so a
# routine release re-runs the whole loop and most servers are already live.
# The MCP Registry returns HTTP 400 with `cannot publish duplicate version`
# for that case — positively identify it (mirroring the npm conflict regex)
# and continue. Every other non-zero exit (expired JWT, network, validation)
# stays a hard failure. Without this, the first release after the initial
# publish always exits non-zero on the unchanged servers — defeating the
# documented idempotency of a re-run.
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
      mcp_out=$(cd "packages/$server" && mcp-publisher publish 2>&1)
      mcp_exit=$?
      set -e
      echo "$mcp_out"
      if [ "$mcp_exit" -eq 0 ]; then
        : # published cleanly
      elif grep -qF 'cannot publish duplicate version' <<<"$mcp_out"; then
        log "  Note: @cesteral/$server already published at this version — continuing."
      else
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

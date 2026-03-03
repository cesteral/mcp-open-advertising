#!/usr/bin/env bash
# Run MCP conformance tests against one or all servers.
# Usage:
#   ./scripts/conformance-test.sh              # test all servers
#   ./scripts/conformance-test.sh dbm-mcp      # test a single server
#   ./scripts/conformance-test.sh --ci         # CI mode (non-zero exit on failure)
#
# Requires: pnpm, npx, node >=20
# Starts each server with MCP_AUTH_MODE=none, runs conformance scenarios, then stops it.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RESULTS_DIR="$ROOT_DIR/.conformance-results"

# Server → port mapping (bash 3.x compatible)
get_port() {
  case "$1" in
    dbm-mcp)   echo 3001 ;;
    dv360-mcp) echo 3002 ;;
    ttd-mcp)   echo 3003 ;;
    gads-mcp)  echo 3004 ;;
    meta-mcp)  echo 3005 ;;
    *) echo "Unknown server: $1" >&2; exit 1 ;;
  esac
}

# Scenarios applicable to all Cesteral servers.
# We skip scenarios requiring specific tool behaviors our servers don't expose
# (e.g., tools-call-image, tools-call-audio, tools-call-embedded-resource).
CORE_SCENARIOS=(
  "server-initialize"
  "ping"
  "tools-list"
  "tools-call"
)

CI_MODE=false
TARGET_SERVER=""

# Parse args
for arg in "$@"; do
  case "$arg" in
    --ci) CI_MODE=true ;;
    *) TARGET_SERVER="$arg" ;;
  esac
done

# Determine which servers to test
if [ -n "$TARGET_SERVER" ] && [ "$TARGET_SERVER" != "--ci" ]; then
  SERVERS=("$TARGET_SERVER")
else
  SERVERS=("dbm-mcp" "dv360-mcp" "ttd-mcp" "gads-mcp" "meta-mcp")
fi

# Clean results
rm -rf "$RESULTS_DIR"
mkdir -p "$RESULTS_DIR"

OVERALL_EXIT=0

for SERVER in "${SERVERS[@]}"; do
  PORT="$(get_port "$SERVER")"
  SERVER_URL="http://localhost:$PORT/mcp"
  echo ""
  echo "========================================"
  echo "  Conformance: $SERVER (port $PORT)"
  echo "========================================"

  # Start server in background with no auth
  cd "$ROOT_DIR"
  MCP_AUTH_MODE=none MCP_TRANSPORT_MODE=http PORT="$PORT" node "packages/$SERVER/dist/index.js" &
  SERVER_PID=$!

  # Wait for server to be ready
  MAX_WAIT=15
  for i in $(seq 1 $MAX_WAIT); do
    if curl -s "http://localhost:$PORT/health" > /dev/null 2>&1; then
      echo "  Server ready after ${i}s"
      break
    fi
    if [ "$i" -eq "$MAX_WAIT" ]; then
      echo "  ERROR: Server failed to start within ${MAX_WAIT}s"
      kill "$SERVER_PID" 2>/dev/null || true
      OVERALL_EXIT=1
      continue 2
    fi
    sleep 1
  done

  # Run each scenario
  SERVER_RESULTS_DIR="$RESULTS_DIR/$SERVER"
  mkdir -p "$SERVER_RESULTS_DIR"

  SERVER_PASS=0
  SERVER_FAIL=0

  for SCENARIO in "${CORE_SCENARIOS[@]}"; do
    echo "  Running: $SCENARIO"
    SCENARIO_OUTPUT=$(npx @modelcontextprotocol/conformance server \
      --url "$SERVER_URL" \
      --scenario "$SCENARIO" \
      --verbose 2>&1) || true

    echo "$SCENARIO_OUTPUT" > "$SERVER_RESULTS_DIR/$SCENARIO.json"

    if echo "$SCENARIO_OUTPUT" | grep -q '"status": "SUCCESS"'; then
      echo "    PASS"
      SERVER_PASS=$((SERVER_PASS + 1))
    else
      echo "    FAIL"
      SERVER_FAIL=$((SERVER_FAIL + 1))
      if $CI_MODE; then
        OVERALL_EXIT=1
      fi
    fi
  done

  # Also run the expected-failures baseline if it exists
  EXPECTED_FAILURES="$ROOT_DIR/conformance/expected-failures.yaml"
  if [ -f "$EXPECTED_FAILURES" ]; then
    echo "  Running active suite with expected-failures baseline..."
    npx @modelcontextprotocol/conformance server \
      --url "$SERVER_URL" \
      --suite active \
      --expected-failures "$EXPECTED_FAILURES" \
      -o "$SERVER_RESULTS_DIR/suite" 2>&1 | tail -5 || true
  fi

  echo "  Results: $SERVER_PASS passed, $SERVER_FAIL failed"

  # Stop server
  kill "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
done

echo ""
echo "========================================"
echo "  Results saved to: $RESULTS_DIR"
echo "========================================"

exit $OVERALL_EXIT

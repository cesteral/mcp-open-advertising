#!/usr/bin/env bash
# Run MCP conformance tests against one or all servers.
# Usage:
#   ./scripts/conformance-test.sh              # test all servers (4 core scenarios)
#   ./scripts/conformance-test.sh dbm-mcp      # test a single server
#   ./scripts/conformance-test.sh --ci         # CI mode (non-zero exit on failure)
#   ./scripts/conformance-test.sh --full       # also run full active suite (slow: ~3min/server)
#
# Requires: pnpm, npx, node >=20
# Starts each server with MCP_AUTH_MODE=none, runs conformance scenarios, then stops it.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RESULTS_DIR="$ROOT_DIR/.conformance-results"

# Server → port, from registry.json (the port must equal the server's config
# default; scripts/lib/fleet-inventory.test.mjs checks that).
get_port() {
  node "$ROOT_DIR/scripts/fleet.mjs" port "$1"
}

# Scenarios applicable to all Cesteral servers. Everything else in the active
# suite runs only with --full, against conformance/expected-failures.yaml.
# Caveat: tools-call-simple-text calls test_simple_text with no `arguments`,
# which the servers reject as invalid input; the 0.1.16 check accepts that
# error result as "simple text", so its PASS does not show a successful call.
# dns-rebinding-protection needs a server on a loopback bind (the harness
# starts it without NODE_ENV, so it binds 127.0.0.1); a hosted deploy with no
# MCP_ALLOWED_HOSTS would fail it by design (#241).
CORE_SCENARIOS=(
  "server-initialize"
  "ping"
  "tools-list"
  "tools-call-simple-text"
  "dns-rebinding-protection"
)

CI_MODE=false
FULL_SUITE=false
TARGET_SERVER=""

# Parse args
for arg in "$@"; do
  case "$arg" in
    --ci) CI_MODE=true ;;
    --full) FULL_SUITE=true ;;
    *) TARGET_SERVER="$arg" ;;
  esac
done

# Determine which servers to test
if [ -n "$TARGET_SERVER" ] && [ "$TARGET_SERVER" != "--ci" ]; then
  SERVERS=("$TARGET_SERVER")
else
  SERVER_LIST="$(node "$ROOT_DIR/scripts/fleet.mjs" servers)"
  # shellcheck disable=SC2206 # package names contain no spaces or globs
  SERVERS=($SERVER_LIST)
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

  # Start server in background with no auth. The two fixture flags register the
  # harness's own test tools (MCP_INCLUDE_CONFORMANCE_TOOLS: test_simple_text,
  # test_tool_with_logging, test_elicitation*) and test resources/prompts
  # (MCP_CONFORMANCE_FIXTURES: test://static-text, test://template/{id}/data,
  # test_simple_prompt, test_prompt_with_arguments). Scenarios call those names;
  # without them every scenario fails on "not found" before exercising anything,
  # and tools-call-simple-text / tools-call-error "pass" on the not-found error.
  cd "$ROOT_DIR"
  MCP_INCLUDE_CONFORMANCE_TOOLS=true MCP_CONFORMANCE_FIXTURES=true \
    MCP_AUTH_MODE=none MCP_TRANSPORT_MODE=http PORT="$PORT" \
    env "$(echo "$SERVER" | tr 'a-z-' 'A-Z_')_PORT=$PORT" \
    node "packages/$SERVER/dist/index.js" &
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
      # Print enough of the captured output to diagnose CI-only failures
      # without uploading the whole JSON as an artifact.
      echo "$SCENARIO_OUTPUT" | tail -20 | sed 's/^/      /'
      SERVER_FAIL=$((SERVER_FAIL + 1))
      if $CI_MODE; then
        OVERALL_EXIT=1
      fi
    fi
  done

  # Optionally run the full active suite with expected-failures baseline.
  # Not run by default because the full active suite takes minutes per server.
  # Run with: ./scripts/conformance-test.sh --full
  # The harness exits non-zero on an unexpected failure AND on a stale baseline
  # entry (a listed scenario that now passes); with --ci either fails the run.
  EXPECTED_FAILURES="$ROOT_DIR/conformance/expected-failures.yaml"
  if $FULL_SUITE && [ -f "$EXPECTED_FAILURES" ]; then
    echo "  Running active suite with expected-failures baseline..."
    SUITE_EXIT=0
    npx @modelcontextprotocol/conformance server \
      --url "$SERVER_URL" \
      --suite active \
      --expected-failures "$EXPECTED_FAILURES" \
      -o "$SERVER_RESULTS_DIR/suite" > "$SERVER_RESULTS_DIR/suite.log" 2>&1 || SUITE_EXIT=$?
    sed -n '/Expected failures/,$p' "$SERVER_RESULTS_DIR/suite.log" | sed 's/^/    /'
    if [ "$SUITE_EXIT" -ne 0 ]; then
      echo "    BASELINE MISMATCH (exit $SUITE_EXIT) — full log: $SERVER_RESULTS_DIR/suite.log"
      if $CI_MODE; then
        OVERALL_EXIT=1
      fi
    fi
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

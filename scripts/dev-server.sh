#!/bin/bash
# Development script to run individual MCP server locally
# Usage: ./scripts/dev-server.sh <server-name>
# Example: ./scripts/dev-server.sh dbm-mcp

set -e

SERVER_NAME=$1

if [ -z "$SERVER_NAME" ]; then
  echo "Usage: ./scripts/dev-server.sh <server-name>"
  echo "Available servers: dbm-mcp, dv360-mcp, ttd-mcp, gads-mcp, meta-mcp, linkedin-mcp, tiktok-mcp, media-mcp"
  exit 1
fi

if [ ! -d "packages/$SERVER_NAME" ]; then
  echo "Error: Server '$SERVER_NAME' does not exist"
  exit 1
fi

echo "Starting $SERVER_NAME in development mode..."
cd "packages/$SERVER_NAME"
pnpm run dev:http

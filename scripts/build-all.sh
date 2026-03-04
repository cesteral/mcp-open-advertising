#!/bin/bash
# Build all packages in the monorepo
# Usage: ./scripts/build-all.sh

set -e

echo "Building all Cesteral MCP packages..."

# Clean previous builds
echo "Cleaning previous builds..."
pnpm run clean

# Build with Turborepo
echo "Building with Turborepo..."
pnpm run build

echo "Build completed successfully!"
echo ""
echo "Built packages:"
echo "  - @cesteral/shared"
echo "  - @cesteral/dbm-mcp"
echo "  - @cesteral/dv360-mcp"
echo "  - @cesteral/ttd-mcp"
echo "  - @cesteral/gads-mcp"
echo "  - @cesteral/meta-mcp"
echo "  - @cesteral/linkedin-mcp"
echo "  - @cesteral/tiktok-mcp"

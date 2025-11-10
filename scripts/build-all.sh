#!/bin/bash
# Build all packages in the monorepo
# Usage: ./scripts/build-all.sh

set -e

echo "Building all BidShifter MCP packages..."

# Clean previous builds
echo "Cleaning previous builds..."
pnpm run clean

# Build with Turborepo
echo "Building with Turborepo..."
pnpm run build

echo "Build completed successfully!"
echo ""
echo "Built packages:"
echo "  - @bidshifter/shared"
echo "  - @bidshifter/platform-lib"
echo "  - @bidshifter/dbm-mcp"
echo "  - @bidshifter/dv360-mcp"
echo "  - @bidshifter/bidshifter-mcp"

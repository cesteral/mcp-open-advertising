# Multi-stage Dockerfile for Cesteral MCP servers
# Build with: docker build --build-arg SERVER_NAME=dbm-mcp -t dbm-mcp .

FROM node:20-alpine AS base
RUN npm install -g pnpm@8.15.0
WORKDIR /app

# Install all dependencies (including devDeps for build)
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/dbm-mcp/package.json ./packages/dbm-mcp/
COPY packages/dv360-mcp/package.json ./packages/dv360-mcp/
COPY packages/ttd-mcp/package.json ./packages/ttd-mcp/
COPY packages/gads-mcp/package.json ./packages/gads-mcp/
COPY packages/meta-mcp/package.json ./packages/meta-mcp/
COPY packages/linkedin-mcp/package.json ./packages/linkedin-mcp/
COPY packages/tiktok-mcp/package.json ./packages/tiktok-mcp/
COPY packages/cm360-mcp/package.json ./packages/cm360-mcp/
COPY packages/sa360-mcp/package.json ./packages/sa360-mcp/
COPY packages/pinterest-mcp/package.json ./packages/pinterest-mcp/
COPY packages/snapchat-mcp/package.json ./packages/snapchat-mcp/
COPY packages/amazon-dsp-mcp/package.json ./packages/amazon-dsp-mcp/
COPY packages/msads-mcp/package.json ./packages/msads-mcp/
RUN pnpm install --frozen-lockfile

# Build all packages, then deploy production-only bundle for the target server.
# `pnpm deploy` copies workspace deps as real files (not symlinks) — correct for Docker.
FROM base AS builder
ARG SERVER_NAME
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY . .
RUN pnpm run build
RUN pnpm --filter "@cesteral/${SERVER_NAME}" deploy --prod /app/deploy

# Production image for specific server
FROM base AS runner
ARG SERVER_NAME
ENV NODE_ENV=production
ENV SERVER_NAME=${SERVER_NAME}

# pnpm deploy produces a self-contained directory:
#   node_modules/  — production deps only, workspace packages copied as files
#   dist/          — compiled server code
#   package.json
COPY --from=builder /app/deploy ./

# Expose port (will be overridden by Cloud Run)
EXPOSE 8080

# Health check for local dev and non-Cloud-Run deployments
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q -O- http://localhost:8080/health || exit 1

# Run as non-root user for security
USER node

# Start the server
CMD ["node", "dist/index.js"]

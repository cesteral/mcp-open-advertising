# Multi-stage Dockerfile for Cesteral MCP servers
# Build with: docker build --build-arg SERVER_NAME=dbm-mcp -t dbm-mcp .

FROM node:20-alpine AS base
RUN npm install -g pnpm@8.15.0
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/dbm-mcp/package.json ./packages/dbm-mcp/
COPY packages/dv360-mcp/package.json ./packages/dv360-mcp/
COPY packages/ttd-mcp/package.json ./packages/ttd-mcp/
COPY packages/gads-mcp/package.json ./packages/gads-mcp/
COPY packages/meta-mcp/package.json ./packages/meta-mcp/
RUN pnpm install --frozen-lockfile

# Build all packages
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY . .
RUN pnpm run build

# Production image for specific server
FROM base AS runner
ARG SERVER_NAME
ENV NODE_ENV=production
ENV SERVER_NAME=${SERVER_NAME}

# Copy only necessary files
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/${SERVER_NAME}/dist ./packages/${SERVER_NAME}/dist
COPY --from=builder /app/packages/${SERVER_NAME}/package.json ./packages/${SERVER_NAME}/

WORKDIR /app/packages/${SERVER_NAME}

# Expose port (will be overridden by Cloud Run)
EXPOSE 3000

# Run as non-root user for security
USER node

# Start the server
CMD ["node", "dist/index.js"]

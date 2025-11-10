# Multi-stage Dockerfile for BidShifter MCP servers
# Build with: docker build --build-arg SERVER_NAME=dbm-mcp -t dbm-mcp .

FROM node:20-alpine AS base
RUN npm install -g pnpm@8.15.0
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/platform-lib/package.json ./packages/platform-lib/
COPY packages/dbm-mcp/package.json ./packages/dbm-mcp/
COPY packages/dv360-mcp/package.json ./packages/dv360-mcp/
COPY packages/bidshifter-mcp/package.json ./packages/bidshifter-mcp/
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
COPY --from=builder /app/packages/platform-lib/dist ./packages/platform-lib/dist
COPY --from=builder /app/packages/platform-lib/package.json ./packages/platform-lib/
COPY --from=builder /app/packages/${SERVER_NAME}/dist ./packages/${SERVER_NAME}/dist
COPY --from=builder /app/packages/${SERVER_NAME}/package.json ./packages/${SERVER_NAME}/

WORKDIR /app/packages/${SERVER_NAME}

# Expose port (will be overridden by Cloud Run)
EXPOSE 3000

# Start the server
CMD ["node", "dist/index.js"]

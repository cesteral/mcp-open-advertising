# Dockerfile for dbm-mcp server
# This uses the multi-stage build from root Dockerfile

FROM node:20-alpine
WORKDIR /app

# Copy built application
COPY dist ./dist
COPY package.json ./
COPY node_modules ./node_modules

ENV NODE_ENV=production
ENV DBM_MCP_PORT=3001

EXPOSE 3001

CMD ["node", "dist/index.js"]

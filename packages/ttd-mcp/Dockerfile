# Dockerfile for ttd-mcp server

FROM node:20-alpine
WORKDIR /app

COPY dist ./dist
COPY package.json ./
COPY node_modules ./node_modules

ENV NODE_ENV=production
ENV TTD_MCP_PORT=3003

EXPOSE 3003

CMD ["node", "dist/index.js"]

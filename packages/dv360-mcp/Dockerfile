# Dockerfile for dv360-mcp server

FROM node:20-alpine
WORKDIR /app

COPY dist ./dist
COPY package.json ./
COPY node_modules ./node_modules

ENV NODE_ENV=production
ENV DV360_MCP_PORT=3002

EXPOSE 3002

CMD ["node", "dist/index.js"]

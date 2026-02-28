# Dockerfile for meta-mcp server

FROM node:20-alpine
WORKDIR /app

COPY dist ./dist
COPY package.json ./
COPY node_modules ./node_modules

ENV NODE_ENV=production
ENV META_MCP_PORT=3005

EXPOSE 3005

CMD ["node", "dist/index.js"]

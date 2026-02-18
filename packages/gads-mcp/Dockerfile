# Dockerfile for gads-mcp server

FROM node:20-alpine
WORKDIR /app

COPY dist ./dist
COPY package.json ./
COPY node_modules ./node_modules

ENV NODE_ENV=production
ENV GADS_MCP_PORT=3004

EXPOSE 3004

CMD ["node", "dist/index.js"]

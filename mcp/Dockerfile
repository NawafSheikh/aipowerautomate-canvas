# Canvas Builder MCP server.
# Minimal on purpose: one stage, node:22-alpine, build from source at image build
# time because mcp/dist is gitignored.
FROM node:22-alpine

# OCI labels. image.source is not cosmetic: it auto-links the GHCR package to
# this repo, and GitHub's docs warn that a token cannot push when a package
# already exists in the namespace and is not connected to a repository.
LABEL org.opencontainers.image.source="https://github.com/NawafSheikh/aipowerautomate-canvas"
LABEL org.opencontainers.image.description="Canvas Builder MCP server: Power Apps canvas app authoring over the Model Context Protocol"
LABEL org.opencontainers.image.licenses="MIT"

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# The server speaks MCP over stdio, so there is no port to expose.
CMD ["node", "dist/index.js"]

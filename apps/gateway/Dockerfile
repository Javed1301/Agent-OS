FROM node:20-slim

# Install Python 3, build tools, and procps for Linux container execution
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    python3-dev \
    build-essential \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Copy uv binary from official Astral Docker image (pinned v0.4.0)
COPY --from=ghcr.io/astral-sh/uv:0.4.0 /uv /uvx /bin/

ENV UV_CACHE_DIR=/root/.cache/uv

WORKDIR /app
RUN mkdir -p /app/runtimes /root/.cache/uv

COPY package*.json ./
COPY apps/gateway/package.json ./apps/gateway/
COPY apps/dashboard/package.json ./apps/dashboard/

RUN npm ci --workspace=@agent-workspace/gateway

COPY . .

RUN npx prisma generate --schema=apps/gateway/prisma/schema.prisma

RUN npm run build --workspace=@agent-workspace/gateway

# Remove devDependencies for production image
RUN npm prune --omit=dev --workspace=@agent-workspace/gateway

WORKDIR /app/apps/gateway

EXPOSE 4000

ENV PORT=4000
ENV WORKSPACE_ROOT=/app
ENV DATABASE_URL=file:/app/data/agent-os.db

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 4000) + '/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

CMD ["node", "dist/index.js"]

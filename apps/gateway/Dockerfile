FROM node:20-slim

# Install Python 3, build tools, curl, and procps for Linux container execution
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    python3-dev \
    build-essential \
    curl \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Install uv using the official Astral installer (avoids PEP 668 error)
RUN curl -LsSf https://astral.sh/uv/install.sh | sh

ENV PATH="/root/.local/bin:$PATH"
ENV UV_CACHE_DIR=/root/.cache/uv

WORKDIR /app
RUN mkdir -p /app/runtimes /root/.cache/uv

COPY package*.json ./

RUN npm install

COPY . .

RUN npm run build

# Remove devDependencies for production image
RUN npm prune --omit=dev

EXPOSE 4000

ENV PORT=4000
ENV WORKSPACE_ROOT=/app

CMD ["node", "dist/index.js"]

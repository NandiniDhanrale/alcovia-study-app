############################
# Stage 1: Build
############################
FROM node:20-slim AS builder

# Install build tools required by better-sqlite3 (native module)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy manifests first (Docker layer cache)
COPY package*.json ./

# Install ALL deps (including devDeps needed for TypeScript build)
RUN npm ci

# Copy source and compile TypeScript
COPY . .
RUN npm run build

############################
# Stage 2: Production image
############################
FROM node:20-slim AS runner

# Runtime deps for better-sqlite3
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy manifests and install production deps only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled JS from builder
COPY --from=builder /app/dist ./dist

# Data directory for SQLite (Railway mounts a volume here)
RUN mkdir -p /data

ENV PORT=3001
ENV NODE_ENV=production

EXPOSE 3001

CMD ["node", "dist/index.js"]
